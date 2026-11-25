package vn.fpt.campusstay.service.assignment;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.work.WorkSource;
import vn.fpt.campusstay.service.inventory.Inventory;

/**
 * Assignment: Staff get the check-in inventories to review or visit and the overdue leavers of their Blocks;
 * Managers the Blocks submitted for approval, late check-in requests, check-out charges to decide (lines Staff
 * sent and shared damage the student declined) and overdue leavers of every Block.
 */
@Component
class AssignmentWork implements WorkSource {

    private final JdbcClient jdbc;
    private final Inventory inventory;

    AssignmentWork(JdbcClient jdbc, Inventory inventory) {
        this.jdbc = jdbc;
        this.inventory = inventory;
    }

    @Override
    public List<WorkItem> work(Asker asker, Instant now) {
        List<WorkItem> out = new ArrayList<>();
        if (asker.staff()) {
            List<Long> beds = asker.blockIds().stream().flatMap(b -> inventory.bedsOfBuilding(b).stream())
                    .map(Inventory.BedSlot::bedId).distinct().toList();
            if (!beds.isEmpty()) {
                Map<String, Object> p = Map.of("beds", beds);
                WorkSource.tally(jdbc, "check-in-inventory", "/staff/check-in/inventories", """
                        SELECT h.visit_at AS due, coalesce(h.verify_requested_at, h.submitted_at) AS since
                        FROM asg_handover h JOIN asg_allocation a ON a.id = h.allocation_id
                        WHERE h.status IN ('SUBMITTED', 'VERIFYING') AND a.bed_id IN (:beds)""", p, now)
                        .ifPresent(out::add);
                WorkSource.tally(jdbc, "leaver-overdue", "/staff/check-out", """
                        SELECT t.overdue_at AS due, t.overdue_at AS since
                        FROM asg_termination t JOIN asg_allocation a ON a.id = t.allocation_id
                        WHERE t.status = 'OVERDUE' AND a.bed_id IN (:beds)""", p, now).ifPresent(out::add);
            }
        }
        if (asker.manager()) {
            WorkSource.tally(jdbc, "assignment", "/manager/assignment", """
                    SELECT NULL::timestamptz AS due, submitted_at AS since FROM asg_run_block WHERE status = 'SUBMITTED'""",
                    Map.of(), now).ifPresent(out::add);
            WorkSource.tally(jdbc, "late-check-in", "/manager/approvals", """
                    SELECT NULL::timestamptz AS due, created_at AS since FROM asg_late_check_in WHERE status = 'PENDING'""",
                    Map.of(), now).ifPresent(out::add);
            WorkSource.tally(jdbc, "check-out-charge", "/manager/approvals/check-out-charges", """
                    SELECT NULL::timestamptz AS due, c.updated_at AS since
                    FROM asg_check_out_damage d JOIN asg_check_out c ON c.id = d.check_out_id
                    WHERE d.manager_review = 'PENDING'
                    UNION ALL
                    SELECT NULL::timestamptz, answered_at FROM asg_damage_claim
                    WHERE status = 'DECLINED' AND manager_review IS NULL""", Map.of(), now).ifPresent(out::add);
            WorkSource.tally(jdbc, "termination-overdue", "/manager/terminations", """
                    SELECT overdue_at AS due, overdue_at AS since FROM asg_termination WHERE status = 'OVERDUE'""",
                    Map.of(), now).ifPresent(out::add);
        }
        return out;
    }
}
