package vn.fpt.campusstay.bil.internal;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.bil.Billing;
import vn.fpt.campusstay.cfg.FeePolicy;
import vn.fpt.campusstay.cfg.TermCatalog;
import vn.fpt.campusstay.cfg.TermSummary;
import vn.fpt.campusstay.shared.audit.AuditLog;

/**
 * Implements {@link Billing}. Invoice code and transfer content come from the
 * row id in the same statement ({@code INV-SP27-000123}, {@code CSTAY000123}),
 * so both are unique without a retry loop.
 */
@Component
class JdbcBilling implements Billing {

    private final JdbcClient jdbc;
    private final InvoiceStore invoices;
    private final TermCatalog terms;
    private final FeePolicy fees;
    private final PaymentProperties payment;
    private final JsonMapper json;
    private final AuditLog audit;
    private final Clock clock;

    JdbcBilling(JdbcClient jdbc, InvoiceStore invoices, TermCatalog terms, FeePolicy fees, PaymentProperties payment,
            JsonMapper json, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.invoices = invoices;
        this.terms = terms;
        this.fees = fees;
        this.payment = payment;
        this.json = json;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public IssuedInvoice issueDeposit(DepositRequest r) {
        TermSummary term = terms.findPublished(r.termId())
                .orElseThrow(() -> new IllegalStateException("Deposit for a Term that is not published: " + r.termId()));
        BigDecimal rate = fees.depositRate();
        String line = "Deposit " + rate.movePointRight(2).stripTrailingZeros().toPlainString() + "% of the Term price "
                + vnd(r.termPrice());
        var issued = jdbc.sql("""
                WITH next AS (SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id)
                INSERT INTO bil_invoice (id, code, term_id, student_id, application_id, type, title, amount, status,
                                         lines, transfer_content, issued_at, due_at, reference)
                OVERRIDING SYSTEM VALUE
                SELECT id, 'INV-' || :termCode || '-' || lpad(id::text, greatest(6, length(id::text)), '0'),
                       :term, :student, :application, 'DEPOSIT', :title, :amount, 'UNPAID', CAST(:lines AS jsonb),
                       :prefix || lpad(id::text, greatest(6, length(id::text)), '0'), :now, :due, :reference
                FROM next
                RETURNING id, code
                """)
                .param("termCode", term.code())
                .param("term", r.termId())
                .param("student", r.studentId())
                .param("application", r.applicationId())
                .param("title", "Deposit · " + term.name())
                .param("amount", r.amount())
                .param("lines", json.writeValueAsString(List.of(Map.of("label", line, "amount", r.amount()))))
                .param("prefix", payment.transferPrefix())
                .param("now", Timestamp.from(Instant.now(clock)))
                .param("due", Timestamp.from(r.dueAt()))
                .param("reference", "Application " + r.applicationCode())
                .query((rs, i) -> new IssuedInvoice(rs.getLong("id"), rs.getString("code"), r.amount(), r.dueAt()))
                .single();
        return issued;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean voidUnpaid(long invoiceId, String reason) {
        return jdbc.sql("""
                UPDATE bil_invoice SET status = 'VOID', voided_reason = :reason, updated_at = :now, version = version + 1
                WHERE id = :id AND status IN ('UPCOMING', 'UNPAID', 'OVERDUE')
                """)
                .param("reason", reason).param("now", Timestamp.from(Instant.now(clock))).param("id", invoiceId)
                .update() > 0;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isPaid(long invoiceId) {
        return invoices.find(invoiceId, false).map(i -> i.status().equals("PAID")).orElse(false);
    }

    @Override
    @Transactional(readOnly = true)
    public List<InvoiceLine> invoicesOfApplication(long applicationId) {
        return invoices.ofApplication(applicationId).stream().map(JdbcBilling::line).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public DueSummary dueSummary(long studentId, long termId) {
        List<InvoiceStore.Invoice> all = jdbc.sql("SELECT " + InvoiceStore.COLUMNS + """
                 FROM bil_invoice WHERE student_id = :student AND term_id = :term AND status <> 'VOID'
                ORDER BY due_at, id
                """)
                .param("student", studentId).param("term", termId)
                .query(InvoiceStore::map).list();
        List<InvoiceStore.Invoice> due = all.stream()
                .filter(i -> i.status().equals("UNPAID") || i.status().equals("OVERDUE")).toList();
        return new DueSummary(due.size(), all.size(), due.stream().findFirst().map(JdbcBilling::line));
    }

    @Override
    @Transactional(readOnly = true)
    public boolean hasOverdueInvoice(long studentId) {
        return jdbc.sql("SELECT count(*) FROM bil_invoice WHERE student_id = :student AND status = 'OVERDUE'")
                .param("student", studentId).query(Long.class).single() > 0;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<Long> requestRefund(long invoiceId, String sourceType, long sourceId, String reason,
            String ruleTriggerCode) {
        InvoiceStore.Invoice invoice = invoices.find(invoiceId, true).orElse(null);
        Optional<FeePolicy.RefundRule> rule = fees.refundRule(ruleTriggerCode);
        if (invoice == null || !invoice.status().equals("PAID") || rule.isEmpty()) {
            return Optional.empty();
        }
        long amount = BigDecimal.valueOf(invoice.amount()).multiply(rule.get().refundPercent())
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValueExact();
        boolean automatic = rule.get().approverRole().equals("SYSTEM");
        long id = jdbc.sql("""
                INSERT INTO bil_refund (term_id, student_id, source_type, source_id, reason, rule_id, paid_amount, amount,
                                        status, decided_at)
                VALUES (:term, :student, :sourceType, :sourceId, :reason, :rule, :paid, :amount, :status, :decidedAt)
                RETURNING id
                """)
                .param("term", invoice.termId())
                .param("student", invoice.studentId())
                .param("sourceType", sourceType)
                .param("sourceId", sourceId)
                .param("reason", reason)
                .param("rule", rule.get().id())
                .param("paid", invoice.amount())
                .param("amount", amount)
                .param("status", automatic ? "APPROVED" : "PENDING")
                .param("decidedAt", automatic ? Timestamp.from(Instant.now(clock)) : null)
                .query(Long.class).single();
        audit.record("REFUND_REQUESTED", AuditLog.Tone.INFO, "Invoice", invoice.id(), invoice.code(),
                Map.of("amount", amount, "rule", rule.get().description(), "status", automatic ? "Approved" : "Pending"));
        return Optional.of(id);
    }

    static InvoiceLine line(InvoiceStore.Invoice i) {
        return new InvoiceLine(i.id(), i.code(), InvoiceLabels.type(i.type()), i.title(), i.amount(),
                InvoiceLabels.status(i.status()), i.dueAt(), i.paidAt());
    }

    static String vnd(long amount) {
        return NumberFormat.getIntegerInstance(Locale.US).format(amount) + " VND";
    }
}
