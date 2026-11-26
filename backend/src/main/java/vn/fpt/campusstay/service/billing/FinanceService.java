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
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.event.InvoiceOverdue;
import vn.fpt.campusstay.event.RefundAccountReminded;
import vn.fpt.campusstay.event.RefundDecided;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.auth.RefundAccounts;
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

    /**
     * @param percent           the rule's refund percentage, null for a refund without a rule (R-21)
     * @param account           where the student wants the money (A-62), null until they enter it
     * @param accountRemindedAt when a Manager last reminded the student to enter it (R-19)
     */
    public record RefundItem(String id, String name, String studentCode, String reason, String rule, long paid,
            long amount, String proposedLabel, BigDecimal percent, boolean exception, String status,
            RefundAccounts.Account account, Instant createdAt, Instant accountRemindedAt, String ruleId,
            boolean selectable) {
    }

    /** An Admin's custom refund rule a Manager may apply to a refund (BE-3RD-10). */
    public record RuleOption(String id, String when, BigDecimal percent, String approver) {
    }

    public record RefundPage(List<RefundItem> items, long total, List<RuleOption> ruleOptions) {
    }

    /** The transfer of a refund to the student's account, with its VietQR image (BE-APP-BIL-18). */
    public record RefundPayment(String refundId, long amount, String status, String content, RefundBank bank,
            RefundQr qr) {
    }

    public record RefundBank(String bin, String name, String holder, String accountNumber) {
    }

    public record RefundQr(String image) {
    }

    /** One of the student's own refunds (R-24); {@code note} is the decision's note (the reason of a rejection). */
    public record MyRefund(String id, String reason, String rule, BigDecimal percent, long paid, long amount,
            String status, Instant createdAt, Instant decidedAt, String note) {
    }

    public record MyRefunds(List<MyRefund> items, long total, long pendingAmount) {
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
    private final RefundAccounts accounts;
    private final vn.fpt.campusstay.config.PaymentProperties payment;
    private final Clock clock;

    public FinanceService(JdbcClient jdbc, InvoiceScope scope, CurrentUser currentUser, TermCatalog terms,
            FeePolicy fees, ApplicationEventPublisher events, AuditLog audit, RefundAccounts accounts,
            vn.fpt.campusstay.config.PaymentProperties payment, Clock clock) {
        this.payment = payment;
        this.jdbc = jdbc;
        this.scope = scope;
        this.currentUser = currentUser;
        this.terms = terms;
        this.fees = fees;
        this.events = events;
        this.audit = audit;
        this.accounts = accounts;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- figures and lists

    /**
     * The search of a list: part of the student's name or student code (and of the Invoice code when {@code code}),
     * any case; blank = no condition. The pattern goes in {@code params} as {@code :q}, LIKE wildcards escaped.
     */
    private static String search(String alias, boolean code, String q, Map<String, Object> params) {
        if (q == null || q.isBlank()) {
            return "";
        }
        params.put("q", "%" + q.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        return " AND (" + alias + ".student_name ILIKE :q OR " + alias + ".student_code ILIKE :q"
                + (code ? " OR " + alias + ".code ILIKE :q" : "") + ")";
    }

    @Transactional(readOnly = true)
    public Summary summary(Long termId, String block) {
        currentUser.require(Permission.VIEW_FINANCE);
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
    public InvoicePage invoices(Long termId, String block, String q, PageQuery page) {
        currentUser.require(Permission.VIEW_FINANCE);
        InvoiceScope.Scope s = scope.resolve(block);
        Map<String, Object> params = params(s, term(termId));
        String where = " FROM bil_invoice i WHERE i.term_id = :term AND i.status <> 'VOID' AND " + s.where("i")
                + search("i", true, q, params);
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
    public OverduePage overdue(Long termId, String block, String q, PageQuery page) {
        currentUser.require(Permission.VIEW_FINANCE);
        InvoiceScope.Scope s = scope.resolve(block);
        Map<String, Object> params = params(s, term(termId));
        String where = " FROM bil_invoice i WHERE i.term_id = :term AND " + OVERDUE + " AND " + s.where("i")
                + search("i", true, q, params);
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
     * Deposits expire, Balances are forfeited and next-Term fees cancel their next-Term Allocation instead.
     */
    @Transactional
    public int markOverdue() {
        record Due(long id, String code, long studentId, String title, long amount, Instant dueAt, String type) {
        }
        List<Due> due = jdbc.sql("""
                UPDATE bil_invoice SET status = 'OVERDUE', updated_at = :now, version = version + 1
                WHERE status = 'UNPAID' AND due_at < :now AND type NOT IN ('DEPOSIT', 'BALANCE', 'TERM_FEE')
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
    public RefundPage refunds(Long termId, String block, String status, String q, PageQuery page) {
        currentUser.require(Permission.VIEW_FINANCE);
        InvoiceScope.Scope s = scope.resolve(block);
        Map<String, Object> params = params(s, term(termId));
        StringBuilder where = new StringBuilder(" FROM bil_refund r WHERE r.term_id = :term AND " + s.where("r")
                + search("r", false, q, params));
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
        record Row(long studentId, RefundItem item) {
        }
        List<Row> rows = jdbc.sql("SELECT r.*" + where
                + " ORDER BY (r.status = 'PENDING') DESC, r.created_at DESC, r.id DESC LIMIT :limit OFFSET :offset")
                .params(params)
                .query((rs, n) -> {
                    Long ruleId = rs.getObject("rule_id", Long.class);
                    FeePolicy.RefundRule rule = ruleId == null ? null : rules.get(ruleId);
                    long paid = rs.getLong("paid_amount");
                    return new Row(rs.getLong("student_id"), new RefundItem(String.valueOf(rs.getLong("id")),
                            rs.getString("student_name"), rs.getString("student_code"), rs.getString("reason"),
                            rule != null ? rule.description() : SOURCES.get(rs.getString("source_type")), paid,
                            rs.getLong("amount"),
                            rule == null ? null : percent(rule.refundPercent()) + " of " + vnd.format(paid) + " VND",
                            rule == null ? null : rule.refundPercent().stripTrailingZeros(),
                            rs.getBoolean("exception"), REFUND_STATUSES.get(rs.getString("status")), null,
                            InvoiceStore.instant(rs, "created_at"), InvoiceStore.instant(rs, "account_reminded_at"),
                            ruleId == null ? null : String.valueOf(ruleId), !settlement(rule)));
                })
                .list();
        Map<Long, RefundAccounts.Account> paidTo = accounts.of(rows.stream().map(Row::studentId).distinct().toList());
        List<RefundItem> items = rows.stream().map(r -> {
            RefundItem i = r.item();
            return new RefundItem(i.id(), i.name(), i.studentCode(), i.reason(), i.rule(), i.paid(), i.amount(),
                    i.proposedLabel(), i.percent(), i.exception(), i.status(), paidTo.get(r.studentId()),
                    i.createdAt(), i.accountRemindedAt(), i.ruleId(), i.selectable());
        }).toList();
        return new RefundPage(items, total, fees.customRules().stream()
                .map(r -> new RuleOption(String.valueOf(r.id()), r.description(),
                        r.refundPercent().stripTrailingZeros(), approverLabel(r.approverRole())))
                .toList());
    }

    /** A Utility Deposit settlement is what is left of the deposit, not a share of a payment: no rule replaces it. */
    private static boolean settlement(FeePolicy.RefundRule rule) {
        return rule != null && rule.triggerCode().equals("UTILITY_DEPOSIT");
    }

    private static String approverLabel(String role) {
        return switch (role) {
            case "SYSTEM" -> "System";
            case "STAFF" -> "Staff";
            case "ADMIN" -> "Admin";
            default -> "Manager";
        };
    }

    /**
     * The refund's transfer for a Manager: the student's bank account and a VietQR image of the amount with the
     * content {@code REFUND-<id>}, built like the Invoice QR (BE-APP-BIL-18). The transfer is then recorded with
     * {@link #markRefundPaid}.
     */
    @Transactional(readOnly = true)
    public RefundPayment refundPayment(String id) {
        currentUser.require(Permission.DECIDE_REFUNDS);
        InvoiceScope.Scope s = scope.resolve(null);
        Map<String, Object> params = new HashMap<>(s.params());
        params.put("id", parse(id).orElse(-1L));
        record Refund(long id, long studentId, long amount, String status) {
        }
        Refund r = jdbc.sql("SELECT * FROM bil_refund r WHERE r.id = :id AND " + s.where("r")).params(params)
                .query((rs, n) -> new Refund(rs.getLong("id"), rs.getLong("student_id"), rs.getLong("amount"),
                        rs.getString("status")))
                .optional().orElseThrow(() -> ApiException.notFound("This refund does not exist."));
        if (r.status().equals("REJECTED") || r.status().equals("PAID")) {
            throw ApiException.conflict("REFUND_CLOSED", "This refund no longer waits for a transfer.");
        }
        RefundAccounts.Account account = accounts.of(List.of(r.studentId())).get(r.studentId());
        if (account == null || account.bin() == null) {
            throw ApiException.conflict("NO_REFUND_ACCOUNT",
                    "The student has not entered a bank account from the list yet. Remind them to enter it.");
        }
        String content = "REFUND-" + r.id();
        String image = payment.qrImageUrl() + "?acc=" + encode(account.number()) + "&bank=" + encode(account.bin())
                + "&amount=" + r.amount() + "&des=" + encode(content) + "&template=compact";
        return new RefundPayment(String.valueOf(r.id()), r.amount(), REFUND_STATUSES.get(r.status()), content,
                new RefundBank(account.bin(), account.bank(), account.holder(), account.number()), new RefundQr(image));
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value == null ? "" : value, java.nio.charset.StandardCharsets.UTF_8);
    }

    /** The student's own refunds, newest first (R-24): refunds are not Invoices, so Payments lists them apart. */
    @Transactional(readOnly = true)
    public MyRefunds mine(PageQuery page) {
        long me = currentUser.require(Role.STUDENT).userId();
        long total = jdbc.sql("SELECT count(*) FROM bil_refund WHERE student_id = :me").param("me", me)
                .query(Long.class).single();
        long pending = jdbc.sql("""
                SELECT coalesce(sum(amount), 0) FROM bil_refund WHERE student_id = :me AND status IN ('PENDING', 'APPROVED')
                """).param("me", me).query(Long.class).single();
        Map<Long, FeePolicy.RefundRule> rules = fees.refundRules();
        List<MyRefund> items = jdbc.sql("""
                SELECT * FROM bil_refund WHERE student_id = :me ORDER BY created_at DESC, id DESC
                LIMIT :limit OFFSET :offset
                """).param("me", me).param("limit", page.limit()).param("offset", page.offset())
                .query((rs, n) -> {
                    Long ruleId = rs.getObject("rule_id", Long.class);
                    FeePolicy.RefundRule rule = ruleId == null ? null : rules.get(ruleId);
                    return new MyRefund(String.valueOf(rs.getLong("id")), rs.getString("reason"),
                            rule != null ? rule.description() : SOURCES.get(rs.getString("source_type")),
                            rule == null ? null : rule.refundPercent().stripTrailingZeros(), rs.getLong("paid_amount"),
                            rs.getLong("amount"), REFUND_STATUSES.get(rs.getString("status")),
                            InvoiceStore.instant(rs, "created_at"), InvoiceStore.instant(rs, "decided_at"),
                            rs.getString("status").equals("REJECTED") ? rs.getString("note") : null);
                })
                .list();
        return new MyRefunds(items, total, pending);
    }

    /**
     * Reminds a student whose refund waits for their bank account to enter it (R-19): in-app and push, at most once a
     * day per refund.
     */
    @Transactional
    public Instant remindAccount(String id) {
        AuthenticatedUser user = currentUser.require(Role.MANAGER, Role.ADMIN);
        InvoiceScope.Scope s = scope.resolve(null);
        Map<String, Object> params = new HashMap<>(s.params());
        params.put("id", parse(id).orElse(-1L));
        record Refund(long id, long studentId, long amount, String reason, String status, Instant remindedAt) {
        }
        Refund r = jdbc.sql("SELECT * FROM bil_refund r WHERE r.id = :id AND " + s.where("r") + " FOR UPDATE")
                .params(params)
                .query((rs, n) -> new Refund(rs.getLong("id"), rs.getLong("student_id"), rs.getLong("amount"),
                        rs.getString("reason"), rs.getString("status"), InvoiceStore.instant(rs, "account_reminded_at")))
                .optional().orElseThrow(() -> ApiException.notFound("This refund does not exist."));
        if (!r.status().equals("PENDING") && !r.status().equals("APPROVED")) {
            throw ApiException.conflict("REFUND_CLOSED", "This refund no longer waits for a transfer.");
        }
        if (accounts.of(List.of(r.studentId())).containsKey(r.studentId())) {
            throw ApiException.conflict("ACCOUNT_ENTERED", "The student already entered their bank account.");
        }
        Instant now = Instant.now(clock);
        if (r.remindedAt() != null && r.remindedAt().isAfter(now.minus(1, ChronoUnit.DAYS))) {
            throw ApiException.conflict("ALREADY_REMINDED", "The student was reminded less than a day ago.");
        }
        jdbc.sql("UPDATE bil_refund SET account_reminded_at = :now WHERE id = :id")
                .param("now", Timestamp.from(now)).param("id", r.id()).update();
        audit.record("REFUND_ACCOUNT_REMINDED", AuditLog.Tone.INFO, "Refund", r.id(), r.reason(),
                Map.of("amount", r.amount(), "by", user.name()));
        events.publishEvent(new RefundAccountReminded(r.id(), r.studentId(), r.amount(), r.reason()));
        return now;
    }

    /**
     * Decided by a Manager (Permission.DECIDE_REFUNDS), or by the Admin for rules whose approver is Admin. A note is
     * required to reject or to approve an exception.
     */
    @Transactional
    public void decideRefund(String id, String decision, String note) {
        decideRefund(id, decision, note, null);
    }

    /**
     * @param ruleId an active custom rule the approval applies (BE-3RD-10): the amount becomes the paid amount × its
     *               percent and its approver decides; null keeps the refund's own rule
     */
    @Transactional
    public void decideRefund(String id, String decision, String note, String ruleId) {
        AuthenticatedUser user = currentUser.require(Role.MANAGER, Role.ADMIN);
        InvoiceScope.Scope s = scope.resolve(null);
        record Refund(long id, long studentId, long amount, String status, boolean exception, String reason,
                Long ruleId, long paid) {
        }
        Map<String, Object> params = new HashMap<>(s.params());
        params.put("id", parse(id).orElse(-1L));
        Refund r = jdbc.sql("SELECT * FROM bil_refund r WHERE r.id = :id AND " + s.where("r") + " FOR UPDATE")
                .params(params)
                .query((rs, n) -> new Refund(rs.getLong("id"), rs.getLong("student_id"), rs.getLong("amount"),
                        rs.getString("status"), rs.getBoolean("exception"), rs.getString("reason"),
                        rs.getObject("rule_id", Long.class), rs.getLong("paid_amount")))
                .optional().orElseThrow(() -> ApiException.notFound("This refund does not exist."));
        FeePolicy.RefundRule chosen = null;
        if (ruleId != null && !ruleId.isBlank() && decision != null && decision.trim().equalsIgnoreCase("approved")) {
            if (r.ruleId() != null && settlement(fees.refundRules().get(r.ruleId()))) {
                throw FieldErrors.single("ruleId", "A Utility Deposit settlement keeps its own amount: no rule applies.");
            }
            chosen = fees.customRules().stream().filter(c -> String.valueOf(c.id()).equals(ruleId.trim())).findFirst()
                    .orElseThrow(() -> FieldErrors.single("ruleId", "Choose one of the active refund rules."));
        }
        Long effectiveRule = chosen != null ? Long.valueOf(chosen.id()) : r.ruleId();
        String approver = effectiveRule == null ? "MANAGER"
                : Optional.ofNullable(fees.refundRules().get(effectiveRule)).map(FeePolicy.RefundRule::approverRole)
                        .orElse("MANAGER");
        boolean allowed = user.is(Role.MANAGER) || user.is(Role.ADMIN) && approver.equals("ADMIN");
        if (!allowed) {
            throw ApiException.forbidden("NOT_REFUND_APPROVER", "This refund is decided by "
                    + (approver.equals("ADMIN") ? "the Admin" : "a Manager") + ".");
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
        long amount = r.amount();
        if (chosen != null) {
            amount = BigDecimal.valueOf(r.paid()).multiply(chosen.refundPercent())
                    .divide(BigDecimal.valueOf(100), 0, java.math.RoundingMode.HALF_UP).longValueExact();
            if (amount <= 0) {
                throw FieldErrors.single("ruleId", "This rule refunds nothing. Reject the refund instead.");
            }
            jdbc.sql("UPDATE bil_refund SET amount = :amount, rule_id = :rule WHERE id = :id")
                    .param("amount", amount).param("rule", chosen.id()).param("id", r.id()).update();
            audit.record("REFUND_RULE_APPLIED", AuditLog.Tone.INFO, "Refund", r.id(), r.reason(),
                    Map.of("rule", chosen.description(), "percent",
                            chosen.refundPercent().stripTrailingZeros().toPlainString(), "from", r.amount(), "to",
                            amount, "by", user.name()));
        }
        jdbc.sql("""
                UPDATE bil_refund SET status = :status, note = :note, decided_by = :by, decided_at = :now,
                       version = version + 1
                WHERE id = :id
                """).param("status", approve ? "APPROVED" : "REJECTED").param("note", text).param("by", user.userId())
                .param("now", Timestamp.from(Instant.now(clock))).param("id", r.id()).update();
        audit.record(approve ? "REFUND_APPROVED" : "REFUND_REJECTED",
                approve ? AuditLog.Tone.SUCCESS : AuditLog.Tone.WARNING, "Refund", r.id(), r.reason(),
                text == null ? Map.of("amount", amount) : Map.of("amount", amount, "note", text));
        events.publishEvent(new RefundDecided(r.id(), r.studentId(), amount, approve ? "approved" : "rejected"));
    }

    /**
     * A Manager records the transfer of an approved refund (Approved → Paid, with the bank reference). A full refund of
     * an Invoice turns that Invoice Refunded.
     */
    @Transactional
    public void markRefundPaid(String id, String reference, String note) {
        AuthenticatedUser user = currentUser.require(Permission.DECIDE_REFUNDS);
        InvoiceScope.Scope s = scope.resolve(null);
        record Refund(long id, String status, long amount, long paidAmount, Long invoiceId, String reason) {
        }
        Map<String, Object> params = new HashMap<>(s.params());
        params.put("id", parse(id).orElse(-1L));
        Refund r = jdbc.sql("SELECT * FROM bil_refund r WHERE r.id = :id AND " + s.where("r") + " FOR UPDATE")
                .params(params)
                .query((rs, n) -> new Refund(rs.getLong("id"), rs.getString("status"), rs.getLong("amount"),
                        rs.getLong("paid_amount"), rs.getObject("invoice_id", Long.class), rs.getString("reason")))
                .optional().orElseThrow(() -> ApiException.notFound("This refund does not exist."));
        if (!r.status().equals("APPROVED")) {
            throw ApiException.conflict("REFUND_NOT_APPROVED", "Only an approved refund can be marked paid.");
        }
        String ref = reference == null ? "" : reference.trim();
        if (ref.isEmpty()) {
            throw FieldErrors.single("reference", "Enter the bank transfer reference.");
        }
        String text = note == null || note.isBlank() ? null : note.trim();
        Instant now = Instant.now(clock);
        jdbc.sql("""
                UPDATE bil_refund SET status = 'PAID', paid_reference = :ref, paid_at = :now, paid_by = :by,
                       note = coalesce(:note, note), version = version + 1
                WHERE id = :id
                """).param("ref", ref).param("now", Timestamp.from(now)).param("by", user.userId())
                .param("note", text).param("id", r.id()).update();
        if (r.invoiceId() != null && r.amount() == r.paidAmount()) {
            jdbc.sql("UPDATE bil_invoice SET status = 'REFUNDED', updated_at = :now WHERE id = :id AND status = 'PAID'")
                    .param("now", Timestamp.from(now)).param("id", r.invoiceId()).update();
        }
        audit.record("REFUND_PAID", AuditLog.Tone.SUCCESS, "Refund", r.id(), r.reason(),
                Map.of("amount", r.amount(), "reference", ref));
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
