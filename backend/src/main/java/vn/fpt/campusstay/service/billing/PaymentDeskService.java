package vn.fpt.campusstay.service.billing;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.event.PaymentConfirmed;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.common.file.FileLinks;
import vn.fpt.campusstay.common.file.FileStore;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.repository.billing.InvoiceStore;

/**
 * Staff › Payments: the Invoices of the Blocks in scope with their Payment,
 * and manual confirmation of a bank transfer that the VietQR match could not
 * settle (wrong memo, amount mismatch reviewed with the student, cash desk).
 */
@Service
public class PaymentDeskService {

    public record Filter(Long termId, String block, String q, String type, String status, String method,
            String date) {
    }

    public record Receipt(String name, long size, String url) {
    }

    public record PaymentItem(String invoiceId, String studentName, String studentCode, String type, String typeLabel,
            long amount, String method, Instant paidAt, Instant dueAt, String status, String reference,
            String transferContent, Receipt receipt) {
    }

    public record Summary(long collectedToday, long collectedTodayCount, long awaitingConfirmation, long unpaidDeposits,
            long depositsPaid, long depositsSubmitted) {
    }

    public record PaymentPage(List<PaymentItem> items, long total, Summary summary) {
    }

    public record ConfirmCommand(Long amount, String reference, String receiptName, byte[] receipt) {
    }

    private record Row(String code, String studentName, String studentCode, String type, long amount, String method,
            Instant paidAt, Instant dueAt, String status, String reference, String transferContent, Long receiptFileId) {
    }

    private static final Map<String, String> TYPES = Map.of("deposit", "DEPOSIT", "balance", "BALANCE", "utility",
            "UTILITY", "roomchange", "ROOM_CHANGE", "room_change", "ROOM_CHANGE", "damage", "DAMAGE");

    private final JdbcClient jdbc;
    private final InvoiceStore invoices;
    private final InvoiceScope scope;
    private final CurrentUser currentUser;
    private final TermCatalog terms;
    private final FeePolicy fees;
    private final FileStore files;
    private final FileLinks links;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public PaymentDeskService(JdbcClient jdbc, InvoiceStore invoices, InvoiceScope scope, CurrentUser currentUser,
            TermCatalog terms, FeePolicy fees, FileStore files, FileLinks links, ApplicationEventPublisher events,
            AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.invoices = invoices;
        this.scope = scope;
        this.currentUser = currentUser;
        this.terms = terms;
        this.fees = fees;
        this.files = files;
        this.links = links;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- list

    @Transactional(readOnly = true)
    public PaymentPage list(Filter f, PageQuery page) {
        currentUser.require(Permission.CONFIRM_PAYMENTS); // Managers confirm payments (ADR-19)
        InvoiceScope.Scope s = scope.resolve(f.block());
        TermSummary term = term(f.termId());
        Instant today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE)).atStartOfDay(TimeConfig.CAMPUS_ZONE)
                .toInstant();

        Map<String, Object> params = new HashMap<>(s.params());
        params.put("term", term.id());
        StringBuilder where = new StringBuilder(" WHERE i.term_id = :term AND " + s.where("i"));
        if (f.q() != null && !f.q().isBlank()) {
            where.append(" AND (i.student_name ILIKE :q OR i.student_code ILIKE :q OR i.code ILIKE :q"
                    + " OR i.transfer_content ILIKE :q)");
            params.put("q", "%" + f.q().trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        if (f.type() != null && !f.type().isBlank()) {
            String type = TYPES.get(f.type().trim().toLowerCase(Locale.ROOT));
            if (type == null) {
                throw FieldErrors.single("type", "Choose a valid Invoice type.");
            }
            where.append(" AND i.type = :type");
            params.put("type", type);
        }
        List<String> statuses = statuses(f.status());
        if (statuses.isEmpty()) {
            where.append(" AND i.status <> 'VOID'");
        } else {
            where.append(" AND i.status IN (:statuses)");
            params.put("statuses", statuses);
        }
        if (f.method() != null && !f.method().isBlank()) {
            String m = f.method().trim().toLowerCase(Locale.ROOT);
            String method = m.startsWith("viet") ? "VIETQR" : m.startsWith("manual") ? "MANUAL" : null;
            if (method == null) {
                throw FieldErrors.single("method", "Choose VietQR or Manual transfer.");
            }
            where.append(" AND i.payment_method = :method");
            params.put("method", method);
        }
        if (f.date() != null && !f.date().isBlank() && !f.date().equals("term")) {
            Instant from = switch (f.date()) {
                case "today" -> today;
                case "7d" -> today.minus(java.time.Duration.ofDays(6));
                default -> throw FieldErrors.single("date", "Choose today, 7d or term.");
            };
            where.append(" AND coalesce(i.paid_at, i.issued_at) >= :from");
            params.put("from", Timestamp.from(from));
        }

        String from = """
                 FROM bil_invoice i
                 LEFT JOIN bil_payment p ON p.invoice_id = i.id AND p.status = 'CONFIRMED'
                 LEFT JOIN bil_bank_transaction t ON t.id = p.bank_transaction_id
                """;
        long total = jdbc.sql("SELECT count(*)" + from + where).params(params).query(Long.class).single();
        params.put("limit", page.limit());
        params.put("offset", page.offset());
        List<Row> rows = jdbc.sql("""
                SELECT i.code, i.student_name, i.student_code, i.type, i.amount, i.payment_method, i.paid_at, i.due_at,
                       i.status, coalesce(p.reference, t.reference_code) AS reference, i.transfer_content,
                       p.receipt_file_id
                """ + from + where + """
                 ORDER BY (i.status = 'AWAITING_CONFIRMATION') DESC, coalesce(i.paid_at, i.issued_at) DESC, i.id DESC
                 LIMIT :limit OFFSET :offset
                """).params(params).query(PaymentDeskService::row).list();
        List<PaymentItem> items = new ArrayList<>();
        for (Row r : rows) {
            Receipt receipt = r.receiptFileId() == null ? null : files.info(r.receiptFileId())
                    .map(file -> new Receipt(file.name(), file.size(), links.link(file.id())))
                    .orElse(null);
            items.add(new PaymentItem(r.code(), r.studentName(), r.studentCode(), InvoiceLabels.type(r.type()),
                    InvoiceLabels.typeLabel(r.type()), r.amount(), InvoiceLabels.method(r.method()), r.paidAt(),
                    r.dueAt(), InvoiceLabels.status(r.status()), r.reference(), r.transferContent(), receipt));
        }
        return new PaymentPage(items, total, summary(s, term.id(), today));
    }

    private Summary summary(InvoiceScope.Scope s, long termId, Instant today) {
        Map<String, Object> params = new HashMap<>(s.params());
        params.put("term", termId);
        params.put("today", Timestamp.from(today));
        return jdbc.sql("""
                SELECT coalesce(sum(p.amount) FILTER (WHERE p.paid_at >= :today), 0) AS collected_today,
                       count(p.id) FILTER (WHERE p.paid_at >= :today) AS collected_today_count,
                       count(*) FILTER (WHERE i.status = 'AWAITING_CONFIRMATION') AS awaiting,
                       count(*) FILTER (WHERE i.type = 'DEPOSIT' AND i.status IN ('UNPAID', 'OVERDUE')) AS unpaid_deposits,
                       count(*) FILTER (WHERE i.type = 'DEPOSIT' AND i.status IN ('PAID', 'REFUNDED')) AS deposits_paid,
                       count(*) FILTER (WHERE i.type = 'DEPOSIT' AND i.status <> 'VOID') AS deposits_submitted
                FROM bil_invoice i
                LEFT JOIN bil_payment p ON p.invoice_id = i.id AND p.status = 'CONFIRMED'
                WHERE i.term_id = :term AND """ + s.where("i"))
                .params(params)
                .query((rs, i) -> new Summary(rs.getLong("collected_today"), rs.getLong("collected_today_count"),
                        rs.getLong("awaiting"), rs.getLong("unpaid_deposits"), rs.getLong("deposits_paid"),
                        rs.getLong("deposits_submitted")))
                .single();
    }

    // ---------------------------------------------------------------- manual confirmation

    @Transactional
    public void confirm(String invoiceCode, ConfirmCommand cmd) {
        AuthenticatedUser user = currentUser.require(Permission.CONFIRM_PAYMENTS);
        InvoiceStore.Invoice found = invoices.find(invoiceCode).filter(scope::visible)
                .orElseThrow(() -> ApiException.notFound("This Invoice does not exist."));
        if (!fees.manualConfirmAllowed()) {
            throw ApiException.conflict("MANUAL_CONFIRM_OFF",
                    "Manual confirmation is turned off. Ask the administrator (Admin › Fees).");
        }
        InvoiceStore.Invoice inv = invoices.find(found.id(), true).orElseThrow();
        if (inv.status().equals("PAID") || inv.status().equals("REFUNDED")) {
            throw ApiException.conflict("ALREADY_PAID", "This Invoice is already paid.");
        }
        if (!inv.payable()) {
            throw ApiException.conflict("INVOICE_NOT_PAYABLE", "This Invoice cannot be paid: it is "
                    + InvoiceLabels.status(inv.status()).toLowerCase(Locale.ROOT) + ".");
        }
        FieldErrors errors = new FieldErrors();
        if (cmd.amount() == null) {
            errors.add("amount", "Enter the amount received.");
        } else if (cmd.amount() != inv.amount()) {
            errors.add("amount", "The amount must be exactly " + NumberFormat.getIntegerInstance(Locale.US)
                    .format(inv.amount()) + " VND, the Invoice amount.");
        }
        String reference = cmd.reference() == null ? "" : cmd.reference().trim();
        if (reference.isEmpty()) {
            errors.add("reference", "Enter the bank reference of the transfer.");
        } else if (reference.length() > 60) {
            errors.add("reference", "Keep the reference under 60 characters.");
        }
        errors.throwIfAny();

        Long receiptId = null;
        if (cmd.receipt() != null && cmd.receipt().length > 0) {
            receiptId = files.store("bil", Optional.ofNullable(cmd.receiptName()).orElse("receipt"), cmd.receipt(),
                    FileStore.IMAGES_AND_PDF, user.userId()).id();
        }
        Instant now = Instant.now(clock);
        try {
            jdbc.sql("""
                    INSERT INTO bil_payment (invoice_id, amount, method, reference, receipt_file_id, paid_at, confirmed_by)
                    VALUES (:invoice, :amount, 'MANUAL', :reference, :receipt, :paidAt, :by)
                    """)
                    .param("invoice", inv.id()).param("amount", inv.amount()).param("reference", reference)
                    .param("receipt", receiptId).param("paidAt", Timestamp.from(now)).param("by", user.userId())
                    .update();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("ALREADY_PAID", "This Invoice is already paid.");
        }
        jdbc.sql("""
                UPDATE bil_invoice SET status = 'PAID', paid_at = :paidAt, payment_method = 'MANUAL', updated_at = :now,
                       version = version + 1
                WHERE id = :id
                """)
                .param("paidAt", Timestamp.from(now)).param("now", Timestamp.from(now)).param("id", inv.id()).update();
        audit.record("PAYMENT_CONFIRMED_MANUALLY", AuditLog.Tone.SUCCESS, "Invoice", inv.id(), inv.code(),
                Map.of("amount", inv.amount(), "method", "Manual transfer", "receipt", receiptId != null));
        events.publishEvent(new PaymentConfirmed(inv.id(), inv.code(), inv.studentId(), inv.applicationId(), inv.type(),
                inv.title(), inv.amount(), now));
    }

    /** The transfer receipt a Staff member attached when confirming. */
    @Transactional(readOnly = true)
    public FileStore.FileContent receiptFile(String invoiceCode) {
        currentUser.require(Permission.CONFIRM_PAYMENTS);
        InvoiceStore.Invoice inv = invoices.find(invoiceCode).filter(scope::visible)
                .orElseThrow(() -> ApiException.notFound("This Invoice does not exist."));
        return jdbc.sql("""
                SELECT receipt_file_id FROM bil_payment
                WHERE invoice_id = :id AND status = 'CONFIRMED' AND receipt_file_id IS NOT NULL
                """).param("id", inv.id()).query(Long.class).optional()
                .flatMap(files::read)
                .orElseThrow(() -> ApiException.notFound("No receipt is attached to this Payment."));
    }

    // ---------------------------------------------------------------- helpers

    /** Labels ({@code Awaiting confirmation}) or codes, comma-separated. */
    private static List<String> statuses(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (String part : value.split(",")) {
            String code = part.trim().toUpperCase(Locale.ROOT).replace(' ', '_');
            if (code.isEmpty()) {
                continue;
            }
            if (InvoiceLabels.status(code) == null) {
                throw FieldErrors.single("status", "Choose a valid Invoice status.");
            }
            result.add(code);
        }
        return result;
    }

    private TermSummary term(Long termId) {
        if (termId != null) {
            return terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        }
        return terms.openForRegistration()
                .or(() -> terms.publishedTerms().stream().filter(TermSummary::current).findFirst())
                .orElseThrow(() -> ApiException.notFound("No Term is published yet."));
    }

    private static Row row(ResultSet rs, int i) throws SQLException {
        return new Row(rs.getString("code"), rs.getString("student_name"), rs.getString("student_code"),
                rs.getString("type"), rs.getLong("amount"), rs.getString("payment_method"),
                InvoiceStore.instant(rs, "paid_at"), InvoiceStore.instant(rs, "due_at"), rs.getString("status"),
                rs.getString("reference"), rs.getString("transfer_content"), rs.getObject("receipt_file_id", Long.class));
    }
}
