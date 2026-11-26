package vn.fpt.campusstay.service.assignment;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.event.CheckInInventoryDue;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * The check-in inventory deadline: a draft not filed by its deadline becomes final with the Room's record (source
 * AUTO; Utility from the door code, nothing pre-existing to claim), and students are reminded {@code handover.remind_hours} and
 * {@code handover.remind_last_hours} before.
 * Idempotent.
 */
@Service
public class HandoverJobService {

    private record Draft(long id, long allocationId, Instant dueAt, int reminders) {
    }

    private final JdbcClient jdbc;
    private final HandoverCore core;
    private final Inventory inventory;
    private final ApplicationEventPublisher events;
    private final Parameters parameters;
    private final Clock clock;

    HandoverJobService(JdbcClient jdbc, HandoverCore core, Inventory inventory, ApplicationEventPublisher events,
            Parameters parameters, Clock clock) {
        this.parameters = parameters;
        this.jdbc = jdbc;
        this.core = core;
        this.inventory = inventory;
        this.events = events;
        this.clock = clock;
    }

    /** @return inventories closed by their deadline */
    @Transactional
    public int closeDue() {
        Instant now = Instant.now(clock);
        List<Long> due = jdbc.sql("""
                SELECT id FROM asg_handover WHERE status = 'DRAFT' AND due_at <= :now ORDER BY id FOR UPDATE SKIP LOCKED
                """).param("now", Timestamp.from(now)).query(Long.class).list();
        for (long id : due) {
            HandoverCore.Row h = core.byId(id, false).orElseThrow();
            HandoverCore.Alloc a = core.allocation(h.allocationId()).orElseThrow();
            // Nothing the student said counts: the Room's record stands.
            jdbc.sql("UPDATE asg_handover_item SET condition = NULL WHERE handover_id = :h").param("h", id).update();
            core.finalize(core.byId(id, false).orElseThrow(), a, "AUTO", null, now);
        }
        return due.size() + closeNeverStarted(now);
    }

    /**
     * Residents who received the code but never opened the inventory (owner decision 25/11/2026): past the deadline
     * their inventory is opened and made final at once with the Room's record, so Utility counts from the code's
     * release (or the approved late arrival) and the check-in is recorded.
     */
    private int closeNeverStarted(Instant now) {
        List<Long> waiting = jdbc.sql("""
                SELECT a.id FROM asg_allocation a
                WHERE a.status = 'ACTIVE' AND a.handover_needed AND a.code_released_at IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM asg_handover h WHERE h.allocation_id = a.id AND h.status <> 'CANCELLED')
                ORDER BY a.id FOR UPDATE OF a SKIP LOCKED
                """).query(Long.class).list();
        int closed = 0;
        for (long allocationId : waiting) {
            HandoverCore.Alloc a = core.allocation(allocationId).orElseThrow();
            if (core.dueFor(a).map(due -> due.isAfter(now)).orElse(true)) {
                continue;
            }
            Inventory.BedSlot bed = inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId());
            if (bed == null) {
                continue;
            }
            long id = core.open(a, bed, now);
            core.finalize(core.byId(id, false).orElseThrow(), a, "AUTO", null, now);
            closed++;
        }
        return closed;
    }

    /** @return reminders sent */
    @Transactional
    public int remind() {
        Instant now = Instant.now(clock);
        int first = parameters.intValue("handover.remind_hours");
        int last = parameters.intValue("handover.remind_last_hours");
        List<Draft> drafts = jdbc.sql("""
                SELECT id, allocation_id, due_at, reminders_sent FROM asg_handover
                WHERE status = 'DRAFT' AND due_at > :now AND reminders_sent < 2 AND due_at <= :soon
                ORDER BY id FOR UPDATE SKIP LOCKED
                """).param("now", Timestamp.from(now)).param("soon", Timestamp.from(now.plus(Duration.ofHours(Math.max(first, last)))))
                .query((rs, i) -> new Draft(rs.getLong("id"), rs.getLong("allocation_id"),
                        rs.getTimestamp("due_at").toInstant(), rs.getInt("reminders_sent")))
                .list();
        int sent = 0;
        for (Draft d : drafts) {
            int step = Duration.between(now, d.dueAt()).compareTo(Duration.ofHours(last)) < 0 ? 2 : 1;
            if (d.reminders() >= step) {
                continue;
            }
            HandoverCore.Alloc a = core.allocation(d.allocationId()).orElseThrow();
            Inventory.BedSlot bed = inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId());
            events.publishEvent(new CheckInInventoryDue(a.studentId(), bed == null ? "" : bed.roomCode(), d.dueAt()));
            jdbc.sql("UPDATE asg_handover SET reminders_sent = :n WHERE id = :id").param("n", step).param("id", d.id())
                    .update();
            sent++;
        }
        return sent;
    }
}
