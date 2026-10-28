package vn.fpt.campusstay.service.assignment;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
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
import vn.fpt.campusstay.event.AllocationForfeited;
import vn.fpt.campusstay.event.PaymentClaimRejected;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Inventory;

/**
 * The forfeit (spec §6.6, §8): an Allocation whose Balance is still unpaid at its deadline, with no claim waiting for
 * confirmation and no approved late check-in still running, is cancelled; the Balance is void and the Deposit is kept
 * (refund rule "Balance not paid", default 0 %). The Bed is free again, so Round 2 may offer it. The same happens when
 * a Balance is cancelled after its payment claims were rejected too often (spec §6.7). Residents are never forfeited.
 */
@Service
public class ForfeitService {

    private record Held(long id, long termId, long studentId, Long applicationId, long bedId) {
    }

    private final JdbcClient jdbc;
    private final Billing billing;
    private final Inventory inventory;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public ForfeitService(JdbcClient jdbc, Billing billing, Inventory inventory, ApplicationEventPublisher events,
            AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.billing = billing;
        this.inventory = inventory;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    /** Every 5 minutes. Idempotent. @return Allocations cancelled */
    @Transactional
    public int forfeitDue() {
        int forfeited = 0;
        for (Billing.DueBalance b : billing.balancesPastDue()) {
            // An approved late check-in does not hold the Balance back: it is paid before check-in, by the deadline
            // the Manager kept or chose when approving (spec §6.9).
            if (forfeit(b.allocationId(), b.invoiceId(), b.dueAt(), "UNPAID")) {
                forfeited++;
            }
        }
        return forfeited;
    }

    /** A Balance cancelled after its claims were rejected too often (Billing's transaction). */
    @EventListener
    void on(PaymentClaimRejected e) {
        if (e.cancelled() && e.type().equals("BALANCE") && e.allocationId() != null) {
            forfeit(e.allocationId(), e.invoiceId(), e.dueAt(), "CLAIMS_REJECTED");
        }
    }

    private boolean forfeit(long allocationId, long balanceInvoiceId, Instant dueAt, String reason) {
        Optional<Held> found = jdbc.sql("""
                SELECT id, term_id, student_id, application_id, bed_id FROM asg_allocation
                WHERE id = :id AND status = 'ACTIVE' AND resident_at IS NULL FOR UPDATE SKIP LOCKED
                """).param("id", allocationId)
                .query((rs, i) -> new Held(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("student_id"),
                        rs.getObject("application_id", Long.class), rs.getLong("bed_id")))
                .optional();
        if (found.isEmpty()) {
            return false;
        }
        Held a = found.get();
        Instant now = Instant.now(clock);
        jdbc.sql("""
                UPDATE asg_allocation SET status = 'CANCELLED', ended_at = :now, end_reason = 'FORFEIT', version = version + 1
                WHERE id = :id
                """).param("now", Timestamp.from(now)).param("id", a.id()).update();
        jdbc.sql("UPDATE asg_late_check_in SET status = 'REJECTED', decision_reason = :why, decided_at = :now "
                + "WHERE allocation_id = :id AND status = 'PENDING'")
                .param("why", "The Bed was released: the Balance was not paid.").param("now", Timestamp.from(now))
                .param("id", a.id()).update();
        billing.voidUnpaid(balanceInvoiceId, "Balance not paid by its deadline");
        Inventory.BedSlot bed = inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId());
        String room = bed == null ? "" : bed.roomCode();
        long refund = 0;
        if (a.applicationId() != null) {
            Billing.InvoiceLine deposit = billing.depositsOf(List.of(a.applicationId())).get(a.applicationId());
            if (deposit != null && deposit.status().equals("Paid")) {
                refund = billing.requestRefund(deposit.id(), "FORFEIT", a.id(), "Balance not paid · Room " + room,
                        "BALANCE_NOT_PAID").map(Billing.RefundRequested::amount).orElse(0L);
            }
        }
        audit.record(Actor.SYSTEM, "ALLOCATION_FORFEITED", AuditLog.Tone.WARNING, "Allocation", a.id(),
                bed == null ? null : "Room " + bed.roomCode() + " · Bed " + bed.bedLabel(),
                Map.of("reason", reason.equals("UNPAID") ? "Balance not paid by its deadline"
                        : "Payment claims rejected", "depositRefund", refund));
        events.publishEvent(new AllocationForfeited(a.id(), a.applicationId(), a.studentId(), a.termId(), room, dueAt,
                refund, reason));
        return true;
    }

    /** The end of a campus day: a deadline on that day runs until it is over. */
    static Instant endOf(LocalDate day) {
        return day.plusDays(1).atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant();
    }
}
