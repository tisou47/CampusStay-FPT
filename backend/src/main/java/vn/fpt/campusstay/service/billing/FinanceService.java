package vn.fpt.campusstay.service.billing;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.event.InvoiceOverdue;
import vn.fpt.campusstay.event.RefundDecided;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.repository.billing.InvoiceStore;

/**
 * Block Finance for the Manager: the Term's figures, the Invoices, overdue
 * Invoices with reminders, and refunds to approve or reject. Scoped like
 * Staff › Payments: by the Invoice's (or refund's) Block, else the Blocks of the
 * student's gender. An Invoice becomes Overdue the hour after its due date
 * (Deposits expire with their Application instead).
 */
@Service
public class FinanceService {

    public record Summary(long invoiced, long invoices, long collected, long overdueCount, long overdueAmount,
            long refundsPendingCount, long refundsPendingAmount) {
    }

    public record InvoiceItem(String id, String name, String studentCode, String typeLabel, long amount, Instant dueAt,
            String status) {
    }

    public record InvoicePage(List<InvoiceItem> items, long total) {
    }

    public record OverdueItem(String invoiceId, String name, String studentCode, String typeLabel, long amount,
            Instant dueAt, long daysOverdue, Instant remindedAt) {
    }

    public record OverduePage(List<OverdueItem> items, long total) {
    }

    public record Sent(int sent) {
    }

    public record RefundItem(String id, String name, String studentCode, String reason, String rule, long paid,
            long amount, String proposedLabel, boolean exception, String status) {
    }

    public record RefundPage(List<RefundItem> items, long total) {
    }

    private static final Map<String, String> REFUND_STATUSES = Map.of("PENDING", "Pending", "APPROVED", "Approved",
            "REJECTED", "Rejected", "PAID", "Paid");
    private static final Map<String, String> SOURCES = Map.of("APPLICATION_CANCEL", "Application cancelled",
            "CHECK_OUT", "Check-out", "ROOM_CHANGE", "Room change or swap", "OTHER", "Other", "FORFEIT",
            "Balance not paid", "TERMINATION", "Termination");
    /** Overdue: marked by the job, or past due and not marked yet. Deposits expire and Balances are forfeited instead. */
    private static final String OVERDUE = "(i.status = 'OVERDUE' OR (i.status = 'UNPAID' AND i.due_at < :now)) "
            + "AND i.type NOT IN ('DEPOSIT', 'BALANCE')";

    private final JdbcClient jdbc;
    private final InvoiceScope scope;
    private final CurrentUser currentUser;
    private final TermCatalog terms;
    private final FeePolicy fees;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public FinanceService(JdbcClient jdbc, InvoiceScope scope, CurrentUser currentUser, TermCatalog terms,
            FeePolicy fees, ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.scope = scope;
        this.currentUser = currentUser;
        this.terms = terms;
        this.fees = fees;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- figures and lists

    @Transactional(readOnly = true)
    public Summary summary(Long termId, String block) {
        InvoiceScope.Scope s = scope.resolve(block);
        Map<String, Object> params = params(s, term(termId));
        record Invoices(long invoiced, long count, long collected, long overdueCount, long overdueAmount) {
        }
        Invoices i = jdbc.sql("""
                SELECT coalesce(sum(i.amount) FILTER (WHERE i.status <> 'VOID'), 0) AS invoiced,
                       count(*) FILTER (WHERE i.status <> 'VOID') AS invoices,
                       coalesce(sum(i.amount) FILTER (WHERE i.status IN ('PAID', 'REFUNDED')), 0) AS collected,
                       count(*) FILTER (WHERE %1$s) AS overdue_count,
                       coalesce(sum(i.amount) FILTER (WHERE %1$s), 0) AS overdue_amount
                FROM bil_invoice i WHERE i.term_id = :term AND %2$s
                """.formatted(OVERDUE, s.where("i")))
                .params(params)
                .query((rs, n) -> new Invoices(rs.getLong("invoiced"), rs.getLong("invoices"), rs.getLong("collected"),
                        rs.getLong("overdue_count"), rs.getLong("overdue_amount")))
                .single();
        record Refunds(long count, long amount) {
        }
        Refunds r = jdbc.sql("""
                SELECT count(*) AS n, coalesce(sum(amount), 0) AS amount FROM bil_refund r
                WHERE r.term_id = :term AND r.status = 'PENDING' AND %s
                """.formatted(s.where("r")))
                .params(params).query((rs, n) -> new Refunds(rs.getLong("n"), rs.getLong("amount"))).single();
        return new Summary(i.invoiced(), i.count(), i.collected(), i.overdueCount(), i.overdueAmount(), r.count(),
                r.amount());
    }

    @Transactional(readOnly = true)
    public InvoicePage invoices(Long termId, String block, PageQuery page) {
        InvoiceScope.Scope s = scope.resolve(block);
        Map<String, Object> params = params(s, term(termId));
        String where = " FROM bil_invoice i WHERE i.term_id = :term AND i.status <> 'VOID' AND " + s.where("i");
        long total = jdbc.sql("SELECT count(*)" + where).params(params).query(Long.class).single();
        params.put("limit", page.limit());
        params.put("offset", page.offset());
        List<InvoiceItem> items = jdbc.sql("SELECT i.*" + where
                + " ORDER BY i.issued_at DESC, i.id DESC LIMIT :limit OFFSET :offset")
                .params(params)
                .query((rs, n) -> new InvoiceItem(rs.getString("code"), rs.getString("student_name"),
                        rs.getString("student_code"), InvoiceLabels.typeLabel(rs.getString("type")), rs.getLong("amount"),
                        InvoiceStore.instant(rs, "due_at"), InvoiceLabels.status(rs.getString("status"))))
                .list();
        return new InvoicePage(items, total);
    }

    @Transactional(readOnly = true)
    public OverduePage overdue(Long termId, String block, PageQuery page) {
        InvoiceScope.Scope s = scope.resolve(block);
        Map<String, Object> params = params(s, term(termId));
        String where = " FROM bil_invoice i WHERE i.term_id = :term AND " + OVERDUE + " AND " + s.where("i");
        long total = jdbc.sql("SELECT count(*)" + where).params(params).query(Long.class).single();
        params.put("limit", page.limit());
        params.put("offset", page.offset());
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        List<OverdueItem> items = jdbc.sql("SELECT i.*" + where + " ORDER BY i.due_at, i.id LIMIT :limit OFFSET :offset")
                .params(params)
                .query((rs, n) -> {
                    Instant due = InvoiceStore.instant(rs, "due_at");
                    return new OverdueItem(rs.getString("code"), rs.getString("student_name"),
                            rs.getString("student_code"), InvoiceLabels.typeLabel(rs.getString("type")),
                            rs.getLong("amount"), due,
                            Math.max(0, ChronoUnit.DAYS.between(LocalDate.ofInstant(due, TimeConfig.CAMPUS_ZONE), today)),
                            InvoiceStore.instant(rs, "reminded_at"));
                })
                .list();
        return new OverduePage(items, total);
    }

    /** In-app, push and email reminders for overdue Invoices in the Manager's Blocks; other ids are skipped. */
    @Transactional
    public Sent remind(List<String> invoiceCodes) {
        AuthenticatedUser user = currentUser.require(Role.MANAGER, Role.ADMIN);
        if (invoiceCodes == null || invoiceCodes.isEmpty()) {
            throw FieldErrors.single("invoiceIds", "Select at least one Invoice.");
        }
        InvoiceScope.Scope s = scope.resolve(null);
        Map<String, Object> params = new HashMap<>(s.params());
        params.put("codes", invoiceCodes.stream().map(c -> c.trim().toUpperCase(Locale.ROOT)).toList());
        params.put("now", Timestamp.from(Instant.now(clock)));
        record Due(long id, String code, long studentId, String title, long amount, Instant dueAt) {
        }
        List<Due> due = jdbc.sql("""
                UPDATE bil_invoice i SET reminded_at = :now
                WHERE upper(i.code) IN (:codes) AND %s AND %s
                RETURNING i.id, i.code, i.student_id, i.title, i.amount, i.due_at
                """.formatted(OVERDUE, s.where("i")))
                .params(params)
                .query((rs, n) -> new Due(rs.getLong("id"), rs.getString("code"), rs.getLong("student_id"),
                        rs.getString("title"), rs.getLong("amount"), InvoiceStore.instant(rs, "due_at")))
                .list();
        due.forEach(d -> events.publishEvent(new InvoiceOverdue(d.id(), d.code(), d.studentId(), d.title(), d.amount(),
                d.dueAt(), true)));
        if (!due.isEmpty()) {
            audit.record("PAYMENT_REMINDERS_SENT", AuditLog.Tone.INFO, "Invoice", due.getFirst().id(),
                    due.size() + (due.size() == 1 ? " Invoice" : " Invoices"), Map.of("by", user.name()));
        }
        return new Sent(due.size());
    }

    /**
     * Hourly: unpaid Invoices past their due date become Overdue and the student is told once (a Utility Invoice by
     * its debt warning, {@link UtilityDebtService}). A claim waiting for confirmation stops the clock (spec §6.7).
     */
    @Transactional
    public int markOverdue() {
        record Due(long id, String code, long studentId, String title, long amount, Instant dueAt, String type) {
        }
        List<Due> due = jdbc.sql("""
                UPDATE bil_invoice SET status = 'OVERDUE', updated_at = :now, version = version + 1
                WHERE status = 'UNPAID' AND due_at < :now AND type NOT IN ('DEPOSIT', 'BALANCE')
                RETURNING id, code, student_id, title, amount, due_at, type
                """).param("now", Timestamp.from(Instant.now(clock)))
                .query((rs, n) -> new Due(rs.getLong("id"), rs.getString("code"), rs.getLong("student_id"),
                        rs.getString("title"), rs.getLong("amount"), InvoiceStore.instant(rs, "due_at"),
                        rs.getString("type")))
                .list();
        due.stream().filter(d -> !d.type().equals("UTILITY")).forEach(d -> events.publishEvent(new InvoiceOverdue(
                d.id(), d.code(), d.studentId(), d.title(), d.amount(), d.dueAt(), false)));
        return due.size();
    }

    // ---------------------------------------------------------------- refunds

    /** @param status Pending, Approved, Rejected or Paid */
    @Transactional(readOnly = true)
    public RefundPage refunds(Long termId, String block, String status, PageQuery page) {
        InvoiceScope.Scope s = scope.resolve(block);
        Map<String, Object> params = params(s, term(termId));
        StringBuilder where = new StringBuilder(" FROM bil_refund r WHERE r.term_id = :term AND " + s.where("r"));
        if (status != null && !status.isBlank()) {
            String code = REFUND_STATUSES.entrySet().stream().filter(e -> e.getValue().equalsIgnoreCase(status.trim()))
                    .map(Map.Entry::getKey).findFirst()
                    .orElseThrow(() -> FieldErrors.single("status", "Choose Pending, Approved, Rejected or Paid."));
            where.append(" AND r.status = :status");
            params.put("status", code);
        }
        long total = jdbc.sql("SELECT count(*)" + where).params(params).query(Long.class).single();
        params.put("limit", page.limit());
        params.put("offset", page.offset());
        Map<Long, FeePolicy.RefundRule> rules = fees.refundRules();
        NumberFormat vnd = NumberFormat.getIntegerInstance(Locale.US);
        List<RefundItem> items = jdbc.sql("SELECT r.*" + where
                + " ORDER BY (r.status = 'PENDING') DESC, r.created_at DESC, r.id DESC LIMIT :limit OFFSET :offset")
                .params(params)
                .query((rs, n) -> {
                    Long ruleId = rs.getObject("rule_id", Long.class);
                    FeePolicy.RefundRule rule = ruleId == null ? null : rules.get(ruleId);
                    long paid = rs.getLong("paid_amount");
                    return new RefundItem(String.valueOf(rs.getLong("id")), rs.getString("student_name"),
                            rs.getString("student_code"), rs.getString("reason"),
                            rule != null ? rule.description() : SOURCES.get(rs.getString("source_type")), paid,
                            rs.getLong("amount"),
                            rule == null ? null : percent(rule.refundPercent()) + " of " + vnd.format(paid) + " VND",
                            rs.getBoolean("exception"), REFUND_STATUSES.get(rs.getString("status")));
                })
                .list();
        return new RefundPage(items, total);
    }

    /**
     * Decided by the refund rule's approver (spec §3): a Manager decides every refund, Staff those whose rule says
     * Staff (in their Blocks), the Admin those whose rule says Admin. A note is required to reject or to approve an
     * exception.
     */
    @Transactional
    public void decideRefund(String id, String decision, String note) {
        AuthenticatedUser user = currentUser.require(Role.STAFF, Role.MANAGER, Role.ADMIN);
        InvoiceScope.Scope s = scope.resolve(null);
        record Refund(long id, long studentId, long amount, String status, boolean exception, String reason,
                Long ruleId) {
        }
        Map<String, Object> params = new HashMap<>(s.params());
        params.put("id", parse(id).orElse(-1L));
        Refund r = jdbc.sql("SELECT * FROM bil_refund r WHERE r.id = :id AND " + s.where("r") + " FOR UPDATE")
                .params(params)
                .query((rs, n) -> new Refund(rs.getLong("id"), rs.getLong("student_id"), rs.getLong("amount"),
                        rs.getString("status"), rs.getBoolean("exception"), rs.getString("reason"),
                        rs.getObject("rule_id", Long.class)))
                .optional().orElseThrow(() -> ApiException.notFound("This refund does not exist."));
        String approver = r.ruleId() == null ? "MANAGER"
                : Optional.ofNullable(fees.refundRules().get(r.ruleId())).map(FeePolicy.RefundRule::approverRole)
                        .orElse("MANAGER");
        boolean allowed = user.is(Role.MANAGER) || user.is(Role.STAFF) && approver.equals("STAFF")
                || user.is(Role.ADMIN) && approver.equals("ADMIN");
        if (!allowed) {
            throw ApiException.forbidden("NOT_REFUND_APPROVER", "This refund is decided by "
                    + (approver.equals("ADMIN") ? "the Admin" : approver.equals("STAFF") ? "the Block's Staff"
                            : "a Manager") + ".");
        }
        if (!r.status().equals("PENDING")) {
            throw ApiException.conflict("ALREADY_DECIDED", "This refund was already decided.");
        }
        String d = decision == null ? "" : decision.trim();
        String text = note == null || note.isBlank() ? null : note.trim();
        boolean approve = d.equalsIgnoreCase("approved");
        if (!approve && !d.equalsIgnoreCase("rejected")) {
            throw FieldErrors.single("decision", "Choose Approved or Rejected.");
        }
        if (text == null && (!approve || r.exception())) {
            throw FieldErrors.single("note",
                    approve ? "Write why this exception is approved." : "Write why the refund is rejected.");
        }
        jdbc.sql("""
                UPDATE bil_refund SET status = :status, note = :note, decided_by = :by, decided_at = :now,
                       version = version + 1
                WHERE id = :id
                """).param("status", approve ? "APPROVED" : "REJECTED").param("note", text).param("by", user.userId())
                .param("now", Timestamp.from(Instant.now(clock))).param("id", r.id()).update();
        audit.record(approve ? "REFUND_APPROVED" : "REFUND_REJECTED",
                approve ? AuditLog.Tone.SUCCESS : AuditLog.Tone.WARNING, "Refund", r.id(), r.reason(),
                text == null ? Map.of("amount", r.amount())
                        : Map.of("amount", r.amount(), "note", text));
        events.publishEvent(new RefundDecided(r.id(), r.studentId(), r.amount(), approve ? "approved" : "rejected"));
    }

    // ---------------------------------------------------------------- helpers

    private Map<String, Object> params(InvoiceScope.Scope s, TermSummary term) {
        Map<String, Object> params = new HashMap<>(s.params());
        params.put("term", term.id());
        params.put("now", Timestamp.from(Instant.now(clock)));
        return params;
    }

    private TermSummary term(Long termId) {
        if (termId != null) {
            return terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        }
        return terms.publishedTerms().stream().filter(TermSummary::current).findFirst()
                .or(terms::openForRegistration)
                .orElseThrow(() -> ApiException.notFound("No Term is published yet."));
    }

    private static String percent(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString() + "%";
    }

    private static Optional<Long> parse(String value) {
        if (value == null || value.isBlank() || value.length() > 18 || !value.trim().chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(value.trim()));
    }
}
