package vn.fpt.campusstay.service.assignment;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.Actor;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.PaymentClaimRejected;
import vn.fpt.campusstay.event.PaymentConfirmed;
import vn.fpt.campusstay.event.RenewalWorkUndecided;
import vn.fpt.campusstay.event.RequestsWindowOpened;
import vn.fpt.campusstay.event.StudentNotEnrolled;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.service.auth.Reconciliations;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * The requests window of a Term (spec §5.1, §6.10). Scheduled steps, each idempotent: M2 creates the next-Term
 * Allocations of the residents of the Term before (continuing, or awaiting extension in the Stay's last Term); M3
 * cancels the ones still awaiting extension; before M4 Managers are alerted about undecided work; after M7 unpaid
 * next-Term fees cancel their Allocation. Also the overview of a window for Staff and Managers.
 */
@Service
public class RenewalService {

    /** A milestone of the window: {@code state} is {@code Done}, {@code Open} or {@code Upcoming}. */
    public record Milestone(String key, String label, Instant at, String state) {
    }

    public record TermRef(String id, String name) {
    }

    /**
     * @param continuing        next-Term Allocations continuing; {@code awaitingExtension} still in their Stay's last Term
     * @param ending            next-Term Allocations cancelled, by reason label
     */
    public record Counts(long continuing, long awaitingExtension, long feesIssued, long feesPaid,
            Map<String, Long> ending) {
    }

    /**
     * @param requests       open next-Term requests by kind
     * @param reconciliation files reconciled and items still open
     * @param newStudentBeds Beds of the Term not held by a continuing resident, and the share kept for new students
     */
    public record Overview(TermRef term, TermRef previousTerm, boolean opened, boolean filing, boolean feesIssued,
            List<Milestone> milestones, Counts counts, Map<String, Long> requests, Reconciliation reconciliation,
            Beds newStudentBeds) {
    }

    public record Reconciliation(long runs, long openItems) {
    }

    public record Beds(long total, long heldByContinuing, long free, double reservedPercent, long reserved) {
    }

    public record WindowItem(String termId, String termName, String previousTermName, Instant opensAt,
            Instant closesAt, Instant decisionsDueAt, boolean opened) {
    }

    private static final Map<String, String> ENDINGS = new LinkedHashMap<>();

    static {
        ENDINGS.put("END_OF_STAY", "End of stay");
        ENDINGS.put("NOT_EXTENDED", "Not extended");
        ENDINGS.put("FEE_NOT_PAID", "Next-Term fee not paid");
        ENDINGS.put("NOT_ENROLLED", "Not enrolled");
        ENDINGS.put("TERMINATED", "Terminated");
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final TermCatalog terms;
    private final JdbcStays stays;
    private final Billing billing;
    private final Inventory inventory;
    private final Parameters parameters;
    private final OpenRenewalRequests openRequests;
    private final Reconciliations reconciliations;
    private final DoorCodeRelease release;
    private final TerminationService terminations;
    private final Applications applications;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public RenewalService(JdbcClient jdbc, CurrentUser currentUser, TermCatalog terms, JdbcStays stays,
            Billing billing, Inventory inventory, Parameters parameters, OpenRenewalRequests openRequests,
            Reconciliations reconciliations, DoorCodeRelease release, TerminationService terminations,
            Applications applications,
            ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.terms = terms;
        this.stays = stays;
        this.billing = billing;
        this.inventory = inventory;
        this.parameters = parameters;
        this.openRequests = openRequests;
        this.reconciliations = reconciliations;
        this.release = release;
        this.terminations = terminations;
        this.applications = applications;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- M2: the window opens

    /** Opens every window whose M2 has come. @return next-Term Allocations created */
    @Transactional
    public int openDue() {
        Instant now = Instant.now(clock);
        int created = 0;
        for (TermCatalog.Renewal r : terms.renewals()) {
            if (r.requestsOpenAt().isAfter(now)) {
                continue;
            }
            int inserted = jdbc.sql("""
                    INSERT INTO asg_renewal (term_id, previous_term_id, opened_at) VALUES (:t, :p, :now)
                    ON CONFLICT (term_id) DO NOTHING
                    """).param("t", r.termId()).param("p", r.previousTermId()).param("now", Timestamp.from(now)).update();
            if (inserted > 0) {
                created += open(r, now);
            }
        }
        return created;
    }

    /**
     * Every resident of N who is not leaving (no check-out started, no termination) keeps their Bed into N+1:
     * continuing while Terms remain on the Stay, awaiting extension when N is its last Term.
     */
    private int open(TermCatalog.Renewal r, Instant now) {
        record Resident(long id, long studentId, long bedId, Instant residentAt) {
        }
        List<Resident> residents = jdbc.sql("""
                SELECT a.id, a.student_id, a.bed_id, a.resident_at FROM asg_allocation a
                WHERE a.term_id = :n AND a.status = 'ACTIVE' AND a.resident_at IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM asg_check_out c WHERE c.allocation_id = a.id)
                  AND NOT EXISTS (SELECT 1 FROM asg_termination t WHERE t.allocation_id = a.id
                                  AND t.status IN ('NOTICE_SENT', 'OVERDUE'))
                ORDER BY a.id FOR UPDATE OF a
                """).param("n", r.previousTermId())
                .query((rs, i) -> new Resident(rs.getLong("id"), rs.getLong("student_id"), rs.getLong("bed_id"),
                        rs.getTimestamp("resident_at").toInstant()))
                .list();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(r.termId(), residents.stream().map(Resident::bedId).toList());
        List<RequestsWindowOpened.Continuing> students = new ArrayList<>();
        int continuing = 0;
        int awaiting = 0;
        for (Resident a : residents) {
            stays.joinStay(a.id(), a.residentAt());
            record Stay(long id, int committed, int used) {
            }
            Stay stay = jdbc.sql("""
                    SELECT s.id, s.committed_terms, s.terms_used FROM asg_stay s
                    JOIN asg_allocation a ON a.stay_id = s.id WHERE a.id = :a
                    """).param("a", a.id())
                    .query((rs, i) -> new Stay(rs.getLong("id"), rs.getInt("committed_terms"), rs.getInt("terms_used")))
                    .single();
            String state = stay.committed() > stay.used() ? "CONTINUING" : "AWAITING_EXTENSION";
            int rows = jdbc.sql("""
                    INSERT INTO asg_allocation (term_id, student_id, bed_id, source, previous_allocation_id, allocated_at,
                                                stay_id, renewal)
                    VALUES (:t, :student, :bed, 'RENEWAL', :previous, :now, :stay, :state)
                    ON CONFLICT DO NOTHING
                    """).param("t", r.termId()).param("student", a.studentId()).param("bed", a.bedId())
                    .param("previous", a.id()).param("now", Timestamp.from(now)).param("stay", stay.id())
                    .param("state", state).update();
            if (rows == 0) {
                Inventory.BedSlot bed = beds.get(a.bedId());
                audit.record(Actor.SYSTEM, "NEXT_TERM_BED_TAKEN", AuditLog.Tone.WARNING, "Allocation", a.id(),
                        bed == null ? null : "Room " + bed.roomCode() + " · Bed " + bed.bedLabel(),
                        Map.of("term", r.name()));
                continue;
            }
            if (state.equals("CONTINUING")) {
                continuing++;
            } else {
                awaiting++;
            }
            Inventory.BedSlot bed = beds.get(a.bedId());
            students.add(new RequestsWindowOpened.Continuing(a.studentId(), bed == null ? "" : bed.roomCode(),
                    Math.max(0, stay.committed() - stay.used())));
        }
        jdbc.sql("UPDATE asg_renewal SET continuing = :c, awaiting = :w WHERE term_id = :t").param("c", continuing)
                .param("w", awaiting).param("t", r.termId()).update();
        audit.record(Actor.SYSTEM, "REQUESTS_WINDOW_OPENED", AuditLog.Tone.INFO, "Term", r.termId(), r.name(),
                Map.of("continuing", continuing, "awaitingExtension", awaiting));
        events.publishEvent(new RequestsWindowOpened(r.termId(), r.name(), r.requestsCloseAt(), students));
        return continuing + awaiting;
    }

    // ---------------------------------------------------------------- M3: filing closes

    /** Closes the windows whose M3 passed. @return next-Term Allocations cancelled (not extended) */
    @Transactional
    public int closeDue() {
        Instant now = Instant.now(clock);
        int cancelled = 0;
        for (Stays.Window w : stays.openWindows()) {
            if (w.closedAt() != null || w.closesAt().isAfter(now)) {
                continue;
            }
            int updated = jdbc.sql("UPDATE asg_renewal SET closed_at = :now WHERE term_id = :t AND closed_at IS NULL")
                    .param("now", Timestamp.from(now)).param("t", w.termId()).update();
            if (updated == 0) {
                continue;
            }
            List<Long> awaiting = jdbc.sql("""
                    SELECT id FROM asg_allocation
                    WHERE term_id = :t AND status = 'ACTIVE' AND renewal = 'AWAITING_EXTENSION' ORDER BY id FOR UPDATE
                    """).param("t", w.termId()).query(Long.class).list();
            for (long id : awaiting) {
                if (stays.cancel(id, "NOT_EXTENDED")) {
                    cancelled++;
                }
            }
            audit.record(Actor.SYSTEM, "REQUESTS_WINDOW_CLOSED", AuditLog.Tone.INFO, "Term", w.termId(), w.termName(),
                    Map.of("notExtended", awaiting.size()));
        }
        return cancelled;
    }

    // ---------------------------------------------------------------- before M4: the Managers' alert

    /** Alerts Managers once per window when work is undecided close to M4. @return windows alerted */
    @Transactional
    public int escalateDue() {
        Instant now = Instant.now(clock);
        Duration before = Duration.ofHours(Math.max(0, parameters.intValue("stay.escalate_before_hours")));
        int alerted = 0;
        for (Stays.Window w : stays.openWindows()) {
            if (w.feesIssuedAt() != null || w.decisionsDueAt().minus(before).isAfter(now)) {
                continue;
            }
            int updated = jdbc.sql("""
                    UPDATE asg_renewal SET escalated_at = :now WHERE term_id = :t AND escalated_at IS NULL
                    """).param("now", Timestamp.from(now)).param("t", w.termId()).update();
            if (updated == 0) {
                continue;
            }
            long requests = openRequests.total(w.termId());
            long items = reconciliations.status(w.termId()).openItems();
            if (requests + items > 0) {
                events.publishEvent(new RenewalWorkUndecided(w.termId(), w.termName(), requests, items,
                        w.decisionsDueAt()));
                alerted++;
            }
        }
        return alerted;
    }

    // ---------------------------------------------------------------- M7: unpaid next-Term fees

    /**
     * Next-Term fees unpaid at their deadline with no claim waiting: the fee is void and the next-Term Allocation
     * cancelled; the student checks out at the end of the current Term and the Bed goes to Round 2 (spec §5.1 M7).
     * Nothing is kept: nothing of the next Term was used. @return Allocations cancelled
     */
    @Transactional
    public int cancelUnpaidFees() {
        int cancelled = 0;
        for (Billing.DueBalance fee : billing.termFeesPastDue()) {
            if (cancelUnpaid(fee.allocationId(), fee.invoiceId(), "Next-Term fee not paid by its deadline")) {
                cancelled++;
            }
        }
        return cancelled;
    }

    /** A next-Term fee cancelled after its claims were rejected too often (Billing's transaction). */
    @EventListener
    void on(PaymentClaimRejected e) {
        if (e.cancelled() && e.type().equals("TERM_FEE") && e.allocationId() != null) {
            cancelUnpaid(e.allocationId(), e.invoiceId(), "Payment claims rejected");
        }
    }

    private boolean cancelUnpaid(long allocationId, long invoiceId, String why) {
        billing.voidUnpaid(invoiceId, why);
        if (!stays.cancel(allocationId, "FEE_NOT_PAID")) {
            return false;
        }
        audit.record(Actor.SYSTEM, "NEXT_TERM_FEE_NOT_PAID", AuditLog.Tone.WARNING, "Allocation", allocationId, null,
                Map.of("reason", why));
        return true;
    }

    /**
     * A next-Term fee was paid (Billing's transaction): the Stay counts the next Term, and the door code is released
     * at once when the next Term's check-in start has come.
     */
    @EventListener
    void on(PaymentConfirmed e) {
        if (e.type().equals("TERM_FEE") && e.allocationId() != null) {
            stays.feePaid(e.allocationId(), e.paidAt());
            release.releaseAllocations(List.of(e.allocationId()));
        }
    }

    // ---------------------------------------------------------------- reconciliation

    /**
     * A Manager found the student not enrolled (Accounts' transaction, spec §6.12): a next-Term Allocation of the Term
     * is cancelled; a resident of a Term that has started is terminated (reason Not enrolled).
     */
    @EventListener
    void on(StudentNotEnrolled e) {
        Optional<Long> nextTerm = jdbc.sql("""
                SELECT id FROM asg_allocation
                WHERE student_id = :s AND term_id = :t AND status = 'ACTIVE' AND renewal IS NOT NULL
                  AND resident_at IS NULL
                """).param("s", e.studentId()).param("t", e.termId()).query(Long.class).optional();
        if (nextTerm.isPresent()) {
            stays.cancel(nextTerm.get(), "NOT_ENROLLED");
            return;
        }
        if (releaseUnlived(e)) {
            return;
        }
        terminations.notEnrolled(e.studentId(), e.termId(), e.note());
    }

    /**
     * A new student who holds a Bed of the Term but has not lived in it yet: the Bed is released, the unpaid Balance is
     * void, and what was paid (Deposit, Balance) is refunded by the rule "Not enrolled"; the Application is rejected.
     * @return whether such a Bed was released
     */
    private boolean releaseUnlived(StudentNotEnrolled e) {
        record Held(long id, Long applicationId, long bedId) {
        }
        Optional<Held> held = jdbc.sql("""
                UPDATE asg_allocation SET status = 'CANCELLED', ended_at = :now, end_reason = 'NOT_ENROLLED',
                       version = version + 1
                WHERE student_id = :s AND term_id = :t AND status = 'ACTIVE' AND renewal IS NULL AND resident_at IS NULL
                RETURNING id, application_id, bed_id
                """).param("now", Timestamp.from(Instant.now(clock))).param("s", e.studentId()).param("t", e.termId())
                .query((rs, i) -> new Held(rs.getLong("id"), rs.getObject("application_id", Long.class),
                        rs.getLong("bed_id")))
                .optional();
        if (held.isEmpty()) {
            return false;
        }
        Held h = held.get();
        Inventory.BedSlot bed = inventory.beds(e.termId(), List.of(h.bedId())).get(h.bedId());
        if (h.applicationId() != null) {
            for (Billing.InvoiceLine invoice : billing.invoicesOfApplication(h.applicationId())) {
                if (!billing.voidUnpaid(invoice.id(), "Not enrolled") && billing.isPaid(invoice.id())) {
                    billing.requestRefund(invoice.id(), "APPLICATION_CANCEL", h.applicationId(),
                            "Not enrolled · " + invoice.title(), "NOT_ENROLLED");
                }
            }
            applications.notEnrolled(h.applicationId(), e.note());
        }
        audit.record("ALLOCATION_RELEASED_NOT_ENROLLED", AuditLog.Tone.WARNING, "Allocation", h.id(),
                bed == null ? null : "Room " + bed.roomCode() + " · Bed " + bed.bedLabel(), Map.of("note", e.note()));
        return true;
    }

    // ---------------------------------------------------------------- the overview

    /** Windows students and staff can follow: every published Term with renewal milestones, the latest first. */
    @Transactional(readOnly = true)
    public List<WindowItem> windows() {
        currentUser.require(Role.STAFF, Role.MANAGER, Role.ADMIN);
        List<TermCatalog.Renewal> renewals = terms.renewals();
        return renewals.stream().map(r -> {
            Optional<Stays.Window> w = stays.window(r.termId());
            return new WindowItem(String.valueOf(r.termId()), r.name(), r.previousName(), r.requestsOpenAt(),
                    r.requestsCloseAt(), r.decisionsDueAt(), w.map(x -> x.openedAt() != null).orElse(false));
        }).toList();
    }

    /** @param termId null = the latest window that opened, else the next one to open */
    @Transactional(readOnly = true)
    public Overview overview(Long termId) {
        currentUser.require(Role.STAFF, Role.MANAGER, Role.ADMIN);
        Stays.Window w = window(termId);
        Instant now = Instant.now(clock);
        List<Milestone> milestones = new ArrayList<>();
        milestone(milestones, "requestsOpenAt", "Requests window opens (M2)", w.opensAt(), w.openedAt() != null, now);
        milestone(milestones, "requestsCloseAt", "Request deadline (M3)", w.closesAt(), w.closedAt() != null, now);
        milestone(milestones, "decisionsDueAt", "Decision deadline (M4)", w.decisionsDueAt(), false, now);
        milestone(milestones, "reconciliationDueAt", "Reconciliation (M5)", w.reconciliationDueAt(), false, now);
        milestone(milestones, "feesIssueAt", "Next-Term fees (M6)", w.feesIssueAt(), w.feesIssuedAt() != null, now);
        milestone(milestones, "feesDueAt", "Next-Term fee deadline (M7)", w.feesDueAt(), false, now);

        record Row(String renewal, String endReason, String status, boolean paid, long n) {
        }
        List<Row> rows = jdbc.sql("""
                SELECT renewal, end_reason, status, fee_paid_at IS NOT NULL AS paid, count(*) AS n FROM asg_allocation
                WHERE term_id = :t AND (renewal IS NOT NULL OR source = 'RENEWAL')
                GROUP BY renewal, end_reason, status, fee_paid_at IS NOT NULL
                """).param("t", w.termId())
                .query((rs, i) -> new Row(rs.getString("renewal"), rs.getString("end_reason"), rs.getString("status"),
                        rs.getBoolean("paid"), rs.getLong("n")))
                .list();
        long continuing = rows.stream().filter(r -> r.status().equals("ACTIVE") && "CONTINUING".equals(r.renewal()))
                .mapToLong(Row::n).sum();
        long awaiting = rows.stream().filter(r -> r.status().equals("ACTIVE") && "AWAITING_EXTENSION".equals(r.renewal()))
                .mapToLong(Row::n).sum();
        long paid = rows.stream().filter(r -> r.status().equals("ACTIVE") && r.paid()).mapToLong(Row::n).sum();
        Map<String, Long> ending = new LinkedHashMap<>();
        ENDINGS.forEach((code, label) -> {
            long n = rows.stream().filter(r -> code.equals(r.endReason())).mapToLong(Row::n).sum();
            if (n > 0) {
                ending.put(label, n);
            }
        });
        long issued = billing.termFees(jdbc.sql("""
                SELECT id FROM asg_allocation WHERE term_id = :t AND status = 'ACTIVE' AND renewal IS NOT NULL
                """).param("t", w.termId()).query(Long.class).list()).size();
        Reconciliations.Status rec = reconciliations.status(w.termId());
        return new Overview(new TermRef(String.valueOf(w.termId()), w.termName()),
                new TermRef(String.valueOf(w.previousTermId()), w.previousTermName()), w.openedAt() != null,
                w.filing(now), w.feesIssuedAt() != null, milestones,
                new Counts(continuing, awaiting, issued, paid, ending), openRequests.open(w.termId()),
                new Reconciliation(rec.runs(), rec.openItems()), beds(w.termId(), continuing + awaiting));
    }

    private Beds beds(long termId, long held) {
        long total = inventory.assignableBeds(termId).size();
        double percent = terms.renewal(termId).map(r -> r.reservedNewPercent().doubleValue()).orElse(0.0);
        long free = jdbc.sql("SELECT count(*) FROM asg_allocation WHERE term_id = :t AND status = 'ACTIVE'")
                .param("t", termId).query(Long.class).single();
        return new Beds(total, held, Math.max(0, total - free), percent, (long) Math.ceil(total * percent / 100));
    }

    private Stays.Window window(Long termId) {
        if (termId != null) {
            return stays.window(termId).orElseThrow(() -> ApiException.notFound(
                    "This Term has no requests window: it has no renewal milestones."));
        }
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        List<Stays.Window> all = terms.renewals().stream().map(r -> stays.window(r.termId()).orElseThrow()).toList();
        return all.stream().filter(w -> w.openedAt() != null && w.stayStart().isAfter(today)).findFirst()
                .or(() -> all.stream().filter(w -> w.stayStart().isAfter(today))
                        .min(java.util.Comparator.comparing(Stays.Window::opensAt)))
                .or(() -> all.stream().findFirst())
                .orElseThrow(() -> ApiException.notFound("No Term has a requests window yet."));
    }

    private static void milestone(List<Milestone> list, String key, String label, Instant at, boolean done, Instant now) {
        list.add(new Milestone(key, label, at, done || !at.isAfter(now) ? "Done" : "Upcoming"));
    }
}
