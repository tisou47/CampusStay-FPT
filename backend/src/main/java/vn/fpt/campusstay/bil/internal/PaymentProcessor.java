package vn.fpt.campusstay.bil.internal;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.bil.PaymentConfirmed;
import vn.fpt.campusstay.shared.audit.AuditLog;

/**
 * Matches an incoming bank transfer to an Invoice by its transfer content and
 * confirms the Payment when the amount is exact (ADR-08, architecture §10).
 * Anything else is kept for Staff: less or more money ({@code AMOUNT_MISMATCH},
 * the Invoice waits for confirmation), a second payment ({@code ALREADY_PAID}),
 * no or a void Invoice ({@code UNMATCHED}).
 */
@Component
class PaymentProcessor {

    private record Transaction(long id, String transferType, long amount, String code, String content,
            Instant transactionAt) {
    }

    private final JdbcClient jdbc;
    private final InvoiceStore invoices;
    private final PaymentProperties payment;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;
    private final Pattern codeInContent;

    PaymentProcessor(JdbcClient jdbc, InvoiceStore invoices, PaymentProperties payment,
            ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.invoices = invoices;
        this.payment = payment;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
        this.codeInContent = Pattern.compile(Pattern.quote(payment.transferPrefix()) + "\\d{6,}",
                Pattern.CASE_INSENSITIVE);
    }

    /** Processes one stored transaction if it is still pending; safe to call twice. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void process(long transactionId) {
        Optional<Transaction> found = jdbc.sql("""
                SELECT id, transfer_type, amount, code, content, transaction_at FROM bil_bank_transaction
                WHERE id = :id AND match_status = 'PENDING' FOR UPDATE SKIP LOCKED
                """)
                .param("id", transactionId)
                .query((rs, i) -> new Transaction(rs.getLong("id"), rs.getString("transfer_type"), rs.getLong("amount"),
                        rs.getString("code"), rs.getString("content"), rs.getTimestamp("transaction_at").toInstant()))
                .optional();
        if (found.isEmpty()) {
            return;
        }
        Transaction txn = found.get();
        if (!txn.transferType().equals("in")) {
            finish(txn, "IGNORED", null);
            return;
        }
        Optional<InvoiceStore.Invoice> invoice = transferCode(txn)
                .flatMap(code -> invoices.findByTransferContent(code, true));
        if (invoice.isEmpty() || invoice.get().status().equals("VOID")) {
            // A late transfer for an expired Application also lands here: Staff decide (architecture §10).
            finish(txn, "UNMATCHED", invoice.map(InvoiceStore.Invoice::id).orElse(null));
            return;
        }
        InvoiceStore.Invoice inv = invoice.get();
        if (inv.status().equals("PAID") || inv.status().equals("REFUNDED")) {
            finish(txn, "ALREADY_PAID", inv.id());
            return;
        }
        if (txn.amount() != inv.amount()) {
            jdbc.sql("""
                    UPDATE bil_invoice SET status = 'AWAITING_CONFIRMATION', updated_at = :now, version = version + 1
                    WHERE id = :id AND status IN ('UNPAID', 'OVERDUE', 'UPCOMING')
                    """)
                    .param("now", Timestamp.from(Instant.now(clock))).param("id", inv.id()).update();
            finish(txn, "AMOUNT_MISMATCH", inv.id());
            audit.record("PAYMENT_AMOUNT_MISMATCH", AuditLog.Tone.WARNING, "Invoice", inv.id(), inv.code(),
                    Map.of("expected", inv.amount(), "received", txn.amount()));
            return;
        }
        jdbc.sql("""
                INSERT INTO bil_payment (invoice_id, amount, method, bank_transaction_id, paid_at)
                VALUES (:invoice, :amount, 'VIETQR', :txn, :paidAt)
                """)
                .param("invoice", inv.id()).param("amount", txn.amount()).param("txn", txn.id())
                .param("paidAt", Timestamp.from(txn.transactionAt())).update();
        jdbc.sql("""
                UPDATE bil_invoice SET status = 'PAID', paid_at = :paidAt, payment_method = 'VIETQR', updated_at = :now,
                       version = version + 1
                WHERE id = :id
                """)
                .param("paidAt", Timestamp.from(txn.transactionAt())).param("now", Timestamp.from(Instant.now(clock)))
                .param("id", inv.id()).update();
        finish(txn, "MATCHED", inv.id());
        audit.record("PAYMENT_CONFIRMED", AuditLog.Tone.SUCCESS, "Invoice", inv.id(), inv.code(),
                Map.of("amount", inv.amount(), "method", "VietQR"));
        events.publishEvent(new PaymentConfirmed(inv.id(), inv.code(), inv.studentId(), inv.applicationId(), inv.type(),
                inv.title(), inv.amount(), txn.transactionAt()));
    }

    /** SePay extracts the code by the configured prefix; otherwise look for it in the transfer memo. */
    private Optional<String> transferCode(Transaction txn) {
        if (txn.code() != null && !txn.code().isBlank()) {
            return Optional.of(txn.code().trim().toUpperCase(Locale.ROOT));
        }
        Matcher m = codeInContent.matcher(txn.content() == null ? "" : txn.content());
        return m.find() ? Optional.of(m.group().toUpperCase(Locale.ROOT)) : Optional.empty();
    }

    private void finish(Transaction txn, String status, Long invoiceId) {
        jdbc.sql("""
                UPDATE bil_bank_transaction SET match_status = :status, invoice_id = :invoice, processed_at = :now
                WHERE id = :id
                """)
                .param("status", status).param("invoice", invoiceId).param("now", Timestamp.from(Instant.now(clock)))
                .param("id", txn.id()).update();
    }
}
