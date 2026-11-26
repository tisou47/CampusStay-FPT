package vn.fpt.campusstay.service.maintenance;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.work.WorkSource;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * Maintenance Requests and inspection runs assigned to the Staff member who asks, and the requests of their Blocks
 * nobody took yet, due when they would be escalated ({@code sla.unassigned_max_hours}).
 */
@Component
class MaintenanceWork implements WorkSource {

    private final JdbcClient jdbc;
    private final Parameters parameters;

    MaintenanceWork(JdbcClient jdbc, Parameters parameters) {
        this.jdbc = jdbc;
        this.parameters = parameters;
    }

    @Override
    public List<WorkItem> work(Asker asker, Instant now) {
        List<WorkItem> out = new ArrayList<>();
        if (!asker.staff()) {
            return out;
        }
        Map<String, Object> me = Map.of("me", asker.userId());
        WorkSource.tally(jdbc, "maintenance", "/staff/maintenance", """
                SELECT sla_due_at AS due, reported_at AS since FROM mnt_request
                WHERE assignee_id = :me AND status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')""", me, now)
                .ifPresent(out::add);
        WorkSource.tally(jdbc, "inspection", "/staff/inspections", """
                SELECT due_at AS due, created_at AS since FROM mnt_inspection_run
                WHERE inspector_id = :me AND status IN ('SCHEDULED', 'IN_PROGRESS')""", me, now).ifPresent(out::add);
        if (!asker.blockIds().isEmpty()) {
            WorkSource.tally(jdbc, "maintenance-unassigned", "/staff/maintenance", """
                    SELECT reported_at + make_interval(hours => :h) AS due, reported_at AS since FROM mnt_request
                    WHERE status = 'SUBMITTED' AND assignee_id IS NULL AND building_id IN (:b)""",
                    Map.of("h", parameters.intValue("sla.unassigned_max_hours"), "b", List.copyOf(asker.blockIds())), now)
                    .ifPresent(out::add);
        }
        return out;
    }
}
