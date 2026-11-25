package vn.fpt.campusstay.service.maintenance;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.work.WorkSource;

/** Maintenance Requests and inspection runs assigned to the Staff member who asks. */
@Component
class MaintenanceWork implements WorkSource {

    private final JdbcClient jdbc;

    MaintenanceWork(JdbcClient jdbc) {
        this.jdbc = jdbc;
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
        return out;
    }
}
