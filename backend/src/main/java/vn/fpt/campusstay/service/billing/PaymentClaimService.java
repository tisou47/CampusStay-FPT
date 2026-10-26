package vn.fpt.campusstay.service.billing;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.common.file.FileStore;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.event.PaymentClaimRejected;
import vn.fpt.campusstay.event.PaymentClaimsWaiting;
import vn.fpt.campusstay.event.PaymentConfirmed;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.repository.billing.InvoiceStore;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * Payment claims (ADR-22, spec §6.7, D-12). The student transfers the money and presses "I have transferred": the
 * Invoice waits for confirmation and its deadline stops. Managers confirm claims one by one or in bulk (each Invoice
 * is paid, audited and announced on its own) or reject them with a reason: the deadline then continues with the time
 * that was left, at least {@code payment.rejected_claim_min_hours}; after {@code payment.rejections_to_cancel}
 * rejections a Deposit or a Balance is cancelled together with what depends on it. Utility and charge Invoices are
 * debts: they are never cancelled, and a claim made after their due date leaves the date as it was.
 */
@Service
public class PaymentClaimService {

    /** The claim state of one Invoice, for the student's payment page. */
    public record ClaimView(String status, Instant claimedAt, String reference, int rejected, Rejection lastRejection) {
    }

    public record Rejection(String reason, Instant at) {
    }

    /** @param since {@code today}, {@code 24h}, {@code 7d} or blank (every claim waiting) */
    public record Filter(Long termId, String block, String type, String since, String q) {
    }

    /** @param timeLeftSeconds what was left of the deadline when the student claimed (0 for a debt already due) */
    public record ClaimItem(String invoiceId, String studentName, String studentCode, String type, String typeLabel,
            String title, long amount, Instant claimedAt, Instant dueAt, long timeLeftSeconds, String reference,
            int rejected, String transferContent) {
    }

    public record ClaimSummary(long count, long amount) {
    }

    public record ClaimPage(List<ClaimItem> items, long total, ClaimSummary summary, List<String> types) {
    }

    public record Skipped(String invoiceId, String reason) {
    }

    public record Confirmed(int confirmed, long amount, List<Skipped> skipped) {
    }

    public record Rejected(int rejected, int cancelled, List<Skipped> skipped) {
    }

    /** Invoice types whose deadline decides a place: cancelled after too many rejected claims. */
    static final Set<String> PLACE_TYPES = Set.of("DEPOSIT", "BALANCE");
    private static final int MAX_BULK = 200;

    private record Claim(long id, long invoiceId, Instant claimedAt, String reference, long timeLeftSeconds) {
    }

    private final JdbcClient jdbc;
    private final InvoiceStore invoices;
    private final InvoiceScope scope;
    private final CurrentUser currentUser;
    private final TermCatalog terms;
    private final Parameters parameters;
    private final FileStore files;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public PaymentClaimService(JdbcClient jdbc, InvoiceStore invoices, InvoiceScope scope, CurrentUser currentUser,
            TermCatalog terms, Parameters parameters, FileStore files, ApplicationEventPublisher events, AuditLog audit,
            Clock clock) {
        this.jdbc = jdbc;
        this.invoices = invoices;
        this.scope = scope;
        this.currentUser = currentUser;
        this.terms = terms;
        this.parameters = parameters;
        this.files = files;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- the student

    /** "I have transferred": the Invoice waits for a Manager and its deadline stops. */
    @Transactional
    public ClaimView claim(String invoiceCode, String reference) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        InvoiceStore.Invoice found = invoices.find(invoiceCode).filter(i -> i.studentId() == me.userId())
                .orElseThrow(() -> ApiException.notFound("This Invoice does not exist."));
        InvoiceStore.Invoice inv = invoices.find(found.id(), true).orElseThrow();
        String ref = reference == null || reference.isBlank() ? null : reference.trim();
        if (ref != null && ref.length() > 60) {
            throw FieldErrors.single("reference", "Keep the reference under 60 characters.");
        }
        Instant now = Instant.now(clock);
        switch (inv.status()) {
            case "AWAITING_CONFIRMATION" -> throw ApiException.conflict("CLAIM_WAITING",
                    "You already said you transferred this Invoice. A Manager is checking it.");
            case "PAID", "REFUNDED" -> throw ApiException.conflict("ALREADY_PAID", "This Invoice is already paid.");
            case "UNPAID", "OVERDUE" -> {
            }
            default -> throw ApiException.conflict("INVOICE_NOT_PAYABLE", "This Invoice cannot be paid: it is "
                    + InvoiceLabels.status(inv.status()).toLowerCase(Locale.ROOT) + ".");
        }
        if (PLACE_TYPES.contains(inv.type()) && !now.isBefore(inv.dueAt())) {
            throw ApiException.conflict("DEADLINE_PASSED", "The deadline of this Invoice has passed.");
        }
        long timeLeft = Math.max(0, Duration.between(now, inv.dueAt()).toSeconds());
        insertClaim(inv, me.userId(), now, ref, timeLeft);
        audit.record("PAYMENT_CLAIMED", AuditLog.Tone.INFO, "Invoice", inv.id(), inv.code(),
                ref == null ? Map.of("amount", inv.amount()) : Map.of("amount", inv.amount(), "reference", ref));
        return view(inv.id()).orElseThrow();
    }

    /** The claim state of an Invoice, empty when it was never claimed. */
    @Transactional(readOnly = true)
    public Optional<ClaimView> view(long invoiceId) {
        record Row(String status, Instant claimedAt, String reference, String reason, Instant decidedAt) {
        }
        List<Row> rows = jdbc.sql("""
                SELECT status, claimed_at, reference, reason, decided_at FROM bil_payment_claim
                WHERE invoice_id = :id ORDER BY claimed_at DESC, id DESC
                """).param("id", invoiceId)
                .query((rs, i) -> new Row(rs.getString("status"), InvoiceStore.instant(rs, "claimed_at"),
                        rs.getString("reference"), rs.getString("reason"), InvoiceStore.instant(rs, "decided_at")))
                .list();
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        Row latest = rows.getFirst();
        int rejected = (int) rows.stream().filter(r -> r.status().equals("REJECTED")).count();
        Rejection last = rows.stream().filter(r -> r.status().equals("REJECTED")).findFirst()
                .map(r -> new Rejection(r.reason(), r.decidedAt())).orElse(null);
        return Optional.of(new ClaimView(statusLabel(latest.status()), latest.claimedAt(), latest.reference(), rejected,
                last));
    }

    // ---------------------------------------------------------------- Managers: the queue

    @Transactional(readOnly = true)
    public ClaimPage list(Filter f, PageQuery page) {
        currentUser.require(Permission.CONFIRM_PAYMENTS);
        InvoiceScope.Scope s = scope.resolve(f.block());
        Map<String, Object> params = new HashMap<>(s.params());
        StringBuilder where = new StringBuilder(" WHERE c.status = 'CLAIMED' AND " + s.where("i"));
        if (f.termId() != null) {
            TermSummary term = terms.findPublished(f.termId())
                    .orElseThrow(() -> ApiException.notFound("This Term does not exist."));
            where.append(" AND i.term_id = :term");
            params.put("term", term.id());
        }
        if (f.type() != null && !f.type().isBlank()) {
            String type = InvoiceLabels.typeCode(f.type());
            if (type == null) {
                throw FieldErrors.single("type", "Choose a valid Invoice type.");
            }
            where.append(" AND i.type = :type");
            params.put("type", type);
        }
        if (f.since() != null && !f.since().isBlank()) {
            Instant now = Instant.now(clock);
            Instant from = switch (f.since().trim().toLowerCase(Locale.ROOT)) {
                case "today" -> LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE)).atStartOfDay(TimeConfig.CAMPUS_ZONE)
                        .toInstant();
                case "24h" -> now.minus(Duration.ofHours(24));
                case "7d" -> now.minus(Duration.ofDays(7));
                default -> throw FieldErrors.single("since", "Choose today, 24h or 7d.");
            };
            where.append(" AND c.claimed_at >= :since");
            params.put("since", Timestamp.from(from));
        }
        if (f.q() != null && !f.q().isBlank()) {
            where.append(" AND (i.student_name ILIKE :q OR i.student_code ILIKE :q OR i.code ILIKE :q"
                    + " OR i.transfer_content ILIKE :q OR c.reference ILIKE :q)");
            params.put("q", "%" + f.q().trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        String from = " FROM bil_payment_claim c JOIN bil_invoice i ON i.id = c.invoice_id";
        ClaimSummary summary = jdbc.sql("SELECT count(*) AS n, coalesce(sum(i.amount), 0) AS amount" + from + where)
                .params(params).query((rs, i) -> new ClaimSummary(rs.getLong("n"), rs.getLong("amount"))).single();
        params.put("limit", page.limit());
        params.put("offset", page.offset());
        List<ClaimItem> items = jdbc.sql("""
                SELECT i.code, i.student_name, i.student_code, i.type, i.title, i.amount, i.due_at, i.transfer_content,
                       c.claimed_at, c.time_left_seconds, c.reference,
                       (SELECT count(*) FROM bil_payment_claim r WHERE r.invoice_id = i.id AND r.status = 'REJECTED')
                           AS rejected
                """ + from + where + " ORDER BY c.claimed_at, c.id LIMIT :limit OFFSET :offset")
                .params(params).query(PaymentClaimService::item).list();
        return new ClaimPage(items, summary.count(), summary,
                List.of("Deposit", "Balance", "Utility", "Room change", "Damage"));
    }

    // ---------------------------------------------------------------- Managers: decisions

    /** Confirms the open claims of the Invoices; each is paid, audited and announced on its own. */
    @Transactional
    public Confirmed confirm(List<String> invoiceCodes) {
        AuthenticatedUser user = currentUser.require(Permission.CONFIRM_PAYMENTS);
        List<String> codes = codes(invoiceCodes);
        int confirmed = 0;
        long amount = 0;
        List<Skipped> skipped = new ArrayList<>();
        for (String code : codes) {
            Optional<InvoiceStore.Invoice> inv = lockedInScope(code);
            Optional<Claim> claim = inv.flatMap(i -> openClaim(i.id()));
            if (inv.isEmpty() || claim.isEmpty()) {
                skipped.add(new Skipped(code, inv.isEmpty() ? "This Invoice does not exist."
                        : "No payment claim is waiting for this Invoice."));
                continue;
            }
            pay(inv.get(), claim.get(), user, claim.get().reference(), null);
            confirmed++;
            amount += inv.get().amount();
        }
        return new Confirmed(confirmed, amount, skipped);
    }

    /**
     * One Invoice with an optional receipt: its open claim, or a transfer the Manager saw although the student did
     * not claim it (the claim is recorded in the Manager's name, at the time of the confirmation).
     */
    @Transactional
    public void confirmOne(String invoiceCode, String reference, String receiptName, byte[] receipt) {
        AuthenticatedUser user = currentUser.require(Permission.CONFIRM_PAYMENTS);
        InvoiceStore.Invoice inv = lockedInScope(invoiceCode == null ? "" : invoiceCode.trim())
                .orElseThrow(() -> ApiException.notFound("This Invoice does not exist."));
        String ref = reference == null || reference.isBlank() ? null : reference.trim();
        if (ref != null && ref.length() > 60) {
            throw FieldErrors.single("reference", "Keep the reference under 60 characters.");
        }
        Claim claim = openClaim(inv.id()).orElseGet(() -> {
            if (inv.status().equals("PAID") || inv.status().equals("REFUNDED")) {
                throw ApiException.conflict("ALREADY_PAID", "This Invoice is already paid.");
            }
            if (!inv.status().equals("UNPAID") && !inv.status().equals("OVERDUE")) {
                throw ApiException.conflict("INVOICE_NOT_PAYABLE", "This Invoice cannot be paid: it is "
                        + InvoiceLabels.status(inv.status()).toLowerCase(Locale.ROOT) + ".");
            }
            Instant now = Instant.now(clock);
            long id = insertClaim(inv, user.userId(), now, ref, Math.max(0, Duration.between(now, inv.dueAt()).toSeconds()));
            return new Claim(id, inv.id(), now, ref, 0);
        });
        Long receiptId = receipt == null || receipt.length == 0 ? null
                : files.store("bil", Optional.ofNullable(receiptName).orElse("receipt"), receipt,
                        FileStore.IMAGES_AND_PDF, user.userId()).id();
        pay(inv, claim, user, ref != null ? ref : claim.reference(), receiptId);
    }

    /** Rejects the open claims of the Invoices with one reason (shown to each student). */
    @Transactional
    public Rejected reject(List<String> invoiceCodes, String reason) {
        AuthenticatedUser user = currentUser.require(Permission.CONFIRM_PAYMENTS);
        String why = reason == null ? "" : reason.trim();
        if (why.isEmpty()) {
            throw FieldErrors.single("reason", "Write why the transfer cannot be confirmed.");
        }
        if (why.length() > 500) {
            throw FieldErrors.single("reason", "Keep the reason under 500 characters.");
        }
        List<String> codes = codes(invoiceCodes);
        int limit = Math.max(1, parameters.intValue("payment.rejections_to_cancel"));
        Duration minimum = Duration.ofHours(Math.max(0, parameters.intValue("payment.rejected_claim_min_hours")));
        int rejected = 0;
        int cancelled = 0;
        List<Skipped> skipped = new ArrayList<>();
        for (String code : codes) {
            Optional<InvoiceStore.Invoice> found = lockedInScope(code);
            Optional<Claim> claim = found.flatMap(i -> openClaim(i.id()));
            if (found.isEmpty() || claim.isEmpty()) {
                skipped.add(new Skipped(code, found.isEmpty() ? "This Invoice does not exist."
                        : "No payment claim is waiting for this Invoice."));
                continue;
            }
            InvoiceStore.Invoice inv = found.get();
            Instant now = Instant.now(clock);
            jdbc.sql("""
                    UPDATE bil_payment_claim SET status = 'REJECTED', reason = :reason, decided_by = :by, decided_at = :now
                    WHERE id = :id
                    """).param("reason", why).param("by", user.userId()).param("now", Timestamp.from(now))
                    .param("id", claim.get().id()).update();
            int count = jdbc.sql("SELECT count(*) FROM bil_payment_claim WHERE invoice_id = :id AND status = 'REJECTED'")
                    .param("id", inv.id()).query(Integer.class).single();
            boolean cancel = PLACE_TYPES.contains(inv.type()) && count >= limit;
            Instant due = inv.dueAt();
            if (cancel) {
                jdbc.sql("""
                        UPDATE bil_invoice SET status = 'VOID', voided_reason = :reason, updated_at = :now,
                               version = version + 1
                        WHERE id = :id
                        """).param("reason", "Payment claims rejected " + count + " times")
                        .param("now", Timestamp.from(now)).param("id", inv.id()).update();
                cancelled++;
            } else {
                long left = claim.get().timeLeftSeconds();
                if (left > 0) {
                    Duration back = Duration.ofSeconds(left);
                    due = now.plus(back.compareTo(minimum) < 0 ? minimum : back);
                }
                jdbc.sql("""
                        UPDATE bil_invoice SET status = :status, due_at = :due, updated_at = :now, version = version + 1
                        WHERE id = :id
                        """).param("status", due.isAfter(now) || inv.type().equals("DEPOSIT") ? "UNPAID" : "OVERDUE")
                        .param("due", Timestamp.from(due)).param("now", Timestamp.from(now)).param("id", inv.id())
                        .update();
            }
            rejected++;
            audit.record("PAYMENT_CLAIM_REJECTED", AuditLog.Tone.WARNING, "Invoice", inv.id(), inv.code(),
                    Map.of("amount", inv.amount(), "reason", why, "rejected", count, "cancelled", cancel));
            events.publishEvent(new PaymentClaimRejected(inv.id(), inv.code(), inv.studentId(), inv.applicationId(),
                    inv.allocationId(), inv.type(), inv.title(), inv.amount(), why, due, count, cancel));
        }
        return new Rejected(rejected, cancelled, skipped);
    }

    // ---------------------------------------------------------------- the hourly summary

    /** Managers hear once an hour that claims wait, when new ones arrived since {@code since}. @return claims waiting */
    @Transactional
    public long summarize(Instant since) {
        long fresh = jdbc.sql("SELECT count(*) FROM bil_payment_claim WHERE status = 'CLAIMED' AND claimed_at >= :since")
                .param("since", Timestamp.from(since)).query(Long.class).single();
        if (fresh == 0) {
            return 0;
        }
        ClaimSummary waiting = jdbc.sql("""
                SELECT count(*) AS n, coalesce(sum(i.amount), 0) AS amount
                FROM bil_payment_claim c JOIN bil_invoice i ON i.id = c.invoice_id WHERE c.status = 'CLAIMED'
                """).query((rs, i) -> new ClaimSummary(rs.getLong("n"), rs.getLong("amount"))).single();
        events.publishEvent(new PaymentClaimsWaiting(waiting.count(), waiting.amount()));
        return waiting.count();
    }

    // ---------------------------------------------------------------- helpers

    private long insertClaim(InvoiceStore.Invoice inv, long by, Instant at, String reference, long timeLeft) {
        long id;
        try {
            id = jdbc.sql("""
                    INSERT INTO bil_payment_claim (invoice_id, student_id, claimed_at, claimed_by, reference, time_left_seconds)
                    VALUES (:invoice, :student, :at, :by, :reference, :left) RETURNING id
                    """)
                    .param("invoice", inv.id()).param("student", inv.studentId()).param("at", Timestamp.from(at))
                    .param("by", by).param("reference", reference).param("left", timeLeft)
                    .query(Long.class).single();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("CLAIM_WAITING",
                    "You already said you transferred this Invoice. A Manager is checking it.");
        }
        jdbc.sql("""
                UPDATE bil_invoice SET status = 'AWAITING_CONFIRMATION', updated_at = :now, version = version + 1
                WHERE id = :id
                """).param("now", Timestamp.from(at)).param("id", inv.id()).update();
        return id;
    }

    /** Pays the Invoice at the time of the claim (spec §6.7: only a confirmed claim's time counts). */
    private void pay(InvoiceStore.Invoice inv, Claim claim, AuthenticatedUser user, String reference, Long receiptId) {
        Instant now = Instant.now(clock);
        try {
            jdbc.sql("""
                    INSERT INTO bil_payment (invoice_id, amount, method, claim_id, reference, receipt_file_id, paid_at,
                                             confirmed_by)
                    VALUES (:invoice, :amount, 'TRANSFER', :claim, :reference, :receipt, :paidAt, :by)
                    """)
                    .param("invoice", inv.id()).param("amount", inv.amount()).param("claim", claim.id())
                    .param("reference", reference).param("receipt", receiptId)
                    .param("paidAt", Timestamp.from(claim.claimedAt())).param("by", user.userId()).update();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("ALREADY_PAID", "This Invoice is already paid.");
        }
        jdbc.sql("""
                UPDATE bil_payment_claim SET status = 'CONFIRMED', decided_by = :by, decided_at = :now WHERE id = :id
                """).param("by", user.userId()).param("now", Timestamp.from(now)).param("id", claim.id()).update();
        jdbc.sql("""
                UPDATE bil_invoice SET status = 'PAID', paid_at = :paidAt, payment_method = 'TRANSFER', updated_at = :now,
                       version = version + 1
                WHERE id = :id
                """).param("paidAt", Timestamp.from(claim.claimedAt())).param("now", Timestamp.from(now))
                .param("id", inv.id()).update();
        audit.record("PAYMENT_CONFIRMED", AuditLog.Tone.SUCCESS, "Invoice", inv.id(), inv.code(),
                receiptId == null ? Map.of("amount", inv.amount(), "method", "Bank transfer")
                        : Map.of("amount", inv.amount(), "method", "Bank transfer", "receipt", true));
        events.publishEvent(new PaymentConfirmed(inv.id(), inv.code(), inv.studentId(), inv.applicationId(),
                inv.allocationId(), inv.type(), inv.title(), inv.amount(), claim.claimedAt()));
    }

    /** The Invoice in the Manager's scope, locked; an Invoice outside it does not exist for them. */
    private Optional<InvoiceStore.Invoice> lockedInScope(String code) {
        return invoices.find(code).filter(scope::visible).flatMap(i -> invoices.find(i.id(), true));
    }

    private Optional<Claim> openClaim(long invoiceId) {
        return jdbc.sql("""
                SELECT id, invoice_id, claimed_at, reference, time_left_seconds FROM bil_payment_claim
                WHERE invoice_id = :id AND status = 'CLAIMED' FOR UPDATE
                """).param("id", invoiceId)
                .query((rs, i) -> new Claim(rs.getLong("id"), rs.getLong("invoice_id"),
                        InvoiceStore.instant(rs, "claimed_at"), rs.getString("reference"), rs.getLong("time_left_seconds")))
                .optional();
    }

    private static List<String> codes(List<String> invoiceCodes) {
        if (invoiceCodes == null || invoiceCodes.isEmpty()) {
            throw FieldErrors.single("invoiceIds", "Select at least one Invoice.");
        }
        if (invoiceCodes.size() > MAX_BULK) {
            throw FieldErrors.single("invoiceIds", "Select at most " + MAX_BULK + " Invoices at a time.");
        }
        Set<String> codes = new LinkedHashSet<>();
        invoiceCodes.stream().filter(c -> c != null && !c.isBlank()).map(c -> c.trim().toUpperCase(Locale.ROOT))
                .forEach(codes::add);
        if (codes.isEmpty()) {
            throw FieldErrors.single("invoiceIds", "Select at least one Invoice.");
        }
        return List.copyOf(codes);
    }

    static String statusLabel(String code) {
        return switch (code) {
            case "CLAIMED" -> "Waiting for confirmation";
            case "CONFIRMED" -> "Confirmed";
            default -> "Rejected";
        };
    }

    private static ClaimItem item(ResultSet rs, int i) throws SQLException {
        String type = rs.getString("type");
        return new ClaimItem(rs.getString("code"), rs.getString("student_name"), rs.getString("student_code"),
                InvoiceLabels.type(type), InvoiceLabels.typeLabel(type), rs.getString("title"), rs.getLong("amount"),
                InvoiceStore.instant(rs, "claimed_at"), InvoiceStore.instant(rs, "due_at"),
                rs.getLong("time_left_seconds"), rs.getString("reference"), rs.getInt("rejected"),
                rs.getString("transfer_content"));
    }
}
