package vn.fpt.campusstay.service.assignment;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.Actor;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.event.DoorCodeActivated;
import vn.fpt.campusstay.event.DoorCodeReleased;
import vn.fpt.campusstay.event.PaymentConfirmed;
import vn.fpt.campusstay.event.ResidentLeftRoom;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * Releases a Room's door code to its paid residents (ADR-23, spec §6.8): (a) the Balance or the next-Term fee is
 * paid, (b) the Term's check-in start has come, (c) the Room's code is confirmed on the lock and no change is waiting
 * because someone left. The release makes the student a resident (orange on the room map) and Utility counts from
 * then (spec §6.14); the desk check-in only records the hand-over. A first release starts the student's Stay; the
 * release of a next-Term Allocation ends the Allocation of the Term before (turnover, spec §5.1 M9). It runs when a
 * Balance or next-Term fee is paid, when Staff confirm a Room's code and every 15 minutes (the check-in start). A
 * terminated student past the move-out date is never released a code.
 */
@Component
public class DoorCodeRelease {

    private record Waiting(long id, long termId, long studentId, long bedId, String renewal, boolean feePaid) {
    }

    private final JdbcClient jdbc;
    private final JdbcStays stays;
    private final Billing billing;
    private final Inventory inventory;
    private final TermCatalog terms;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    DoorCodeRelease(JdbcClient jdbc, JdbcStays stays, Billing billing, Inventory inventory, TermCatalog terms,
            ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.stays = stays;
        this.billing = billing;
        this.inventory = inventory;
        this.terms = terms;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    /** The Balance was paid (same transaction as the payment). */
    @EventListener
    void on(PaymentConfirmed e) {
        if (e.type().equals("BALANCE") && e.allocationId() != null) {
            release("allocation_id_list", List.of(e.allocationId()));
        }
    }

    /** A new code was confirmed on the Room's lock: those who waited for it receive it. */
    @EventListener
    void on(DoorCodeActivated e) {
        List<Long> beds = inventory.bedsOfRoom(e.roomId()).stream().map(Inventory.BedSlot::bedId).toList();
        if (!beds.isEmpty()) {
            release("bed_list", beds);
        }
    }

    /** These Allocations, if they wait for their code (a next-Term fee was just paid; the caller's transaction). */
    void releaseAllocations(List<Long> allocationIds) {
        if (!allocationIds.isEmpty()) {
            release("allocation_id_list", allocationIds);
        }
    }

    /** Every Allocation waiting for its code (the check-in start passed since the last run). @return codes released */
    @Transactional
    public int releaseDue() {
        return release(null, List.of());
    }

    /** @param by {@code allocation_id_list}, {@code bed_list} or null for every waiting Allocation */
    private int release(String by, List<Long> ids) {
        String filter = by == null ? "" : by.equals("bed_list") ? " AND a.bed_id IN (:ids)" : " AND a.id IN (:ids)";
        var spec = jdbc.sql("""
                SELECT a.id, a.term_id, a.student_id, a.bed_id, a.renewal, a.fee_paid_at IS NOT NULL AS fee_paid
                FROM asg_allocation a
                WHERE a.status = 'ACTIVE' AND a.code_released_at IS NULL
                  AND NOT EXISTS (SELECT 1 FROM asg_termination t WHERE t.allocation_id = a.id AND t.status = 'OVERDUE')
                """ + filter + " ORDER BY a.id FOR UPDATE OF a SKIP LOCKED");
        if (by != null) {
            spec = spec.param("ids", ids);
        }
        List<Waiting> waiting = spec.query((rs, i) -> new Waiting(rs.getLong("id"), rs.getLong("term_id"),
                rs.getLong("student_id"), rs.getLong("bed_id"), rs.getString("renewal"), rs.getBoolean("fee_paid")))
                .list().stream()
                // A next-Term Allocation waits for its next-Term fee (spec §6.8 (a)).
                .filter(w -> w.renewal() == null || w.feePaid())
                .toList();
        if (waiting.isEmpty()) {
            return 0;
        }
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        Map<Long, Optional<TermSummary>> termsById = new HashMap<>();
        List<Waiting> started = waiting.stream().filter(w -> termsById
                .computeIfAbsent(w.termId(), terms::findPublished)
                .map(t -> t.checkInStart() == null ? !today.isBefore(t.stayStart()) : !today.isBefore(t.checkInStart()))
                .orElse(false)).toList();
        if (started.isEmpty()) {
            return 0;
        }
        Map<Long, Billing.CheckInDue> unpaid = billing.checkInDues(started.stream().map(Waiting::id).toList());
        List<Waiting> paid = started.stream().filter(w -> !unpaid.containsKey(w.id())).toList();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(paid.stream().map(Waiting::bedId).toList());
        Set<Long> ready = inventory.doorCodeReady(beds.values().stream().map(Inventory.BedSlot::roomId).toList());
        Instant now = Instant.now(clock);
        Map<String, List<Long>> byRoom = new LinkedHashMap<>();
        for (Waiting w : paid) {
            Inventory.BedSlot bed = beds.get(w.bedId());
            if (bed == null || !ready.contains(bed.roomId())) {
                continue;
            }
            jdbc.sql("""
                    UPDATE asg_allocation SET code_released_at = :now, resident_at = coalesce(resident_at, :now),
                           version = version + 1
                    WHERE id = :id
                    """).param("now", Timestamp.from(now)).param("id", w.id()).update();
            audit.record(Actor.SYSTEM, "DOOR_CODE_RELEASED", AuditLog.Tone.SUCCESS, "Allocation", w.id(),
                    "Room " + bed.roomCode() + " · Bed " + bed.bedLabel(), null);
            if (w.renewal() != null) {
                endPreviousTerm(w, bed, now);
            } else {
                stays.joinStay(w.id(), now);
            }
            byRoom.computeIfAbsent(bed.roomCode(), r -> new ArrayList<>()).add(w.studentId());
        }
        byRoom.forEach((room, students) -> events.publishEvent(new DoorCodeReleased(room, List.copyOf(students))));
        return byRoom.values().stream().mapToInt(List::size).sum();
    }

    /**
     * A continuing resident lives in the next Term from now (spec §5.1 M9): the Allocation of the Term before ends
     * (Term end). A mover leaves the old Room, so its door code must change.
     */
    private void endPreviousTerm(Waiting w, Inventory.BedSlot bed, Instant now) {
        record Previous(long id, long bedId, boolean resident) {
        }
        List<Previous> previous = jdbc.sql("""
                UPDATE asg_allocation SET status = 'ENDED', ended_at = :now, end_reason = 'TERM_END', version = version + 1
                WHERE student_id = :s AND status = 'ACTIVE' AND term_id <> :t
                RETURNING id, bed_id, resident_at IS NOT NULL AS resident
                """).param("now", Timestamp.from(now)).param("s", w.studentId()).param("t", w.termId())
                .query((rs, i) -> new Previous(rs.getLong("id"), rs.getLong("bed_id"), rs.getBoolean("resident")))
                .list();
        Map<Long, Inventory.BedSlot> old = inventory.beds(previous.stream().map(Previous::bedId).toList());
        for (Previous p : previous) {
            Inventory.BedSlot from = old.get(p.bedId());
            if (p.resident() && from != null && from.roomId() != bed.roomId()) {
                events.publishEvent(new ResidentLeftRoom(from.roomId(), "MOVE_OUT"));
            }
        }
    }
}
