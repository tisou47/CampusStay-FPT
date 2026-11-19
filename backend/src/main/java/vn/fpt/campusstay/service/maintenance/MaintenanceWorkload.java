package vn.fpt.campusstay.service.maintenance;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.auth.StaffWorkload;

/**
 * Implements {@link StaffWorkload} for Maintenance Requests (open ones assigned, overdue past their SLA, resolved ones)
 * and inspection runs (scheduled or in progress for their inspector, overdue past their due time).
 */
@Component
class MaintenanceWorkload implements StaffWorkload {

    private final JdbcClient jdbc;
    private final Clock clock;

    MaintenanceWorkload(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    private record Part(long person, String type, long open, long overdue, Instant oldest, long resolved) {
    }

    @Override
    public Map<Long, Load> workload(Collection<Long> userIds, Instant resolvedSince) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        List<Part> parts = jdbc.sql("""
                SELECT assignee_id AS person, 'MAINTENANCE' AS type,
                       count(*) FILTER (WHERE status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')) AS open,
                       count(*) FILTER (WHERE status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS') AND sla_due_at < :now) AS overdue,
                       min(reported_at) FILTER (WHERE status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')) AS oldest,
                       count(*) FILTER (WHERE resolved_at >= :since) AS resolved
                FROM mnt_request WHERE assignee_id IN (:users)
                GROUP BY assignee_id
                UNION ALL
                SELECT inspector_id, 'INSPECTION',
                       count(*) FILTER (WHERE status IN ('SCHEDULED', 'IN_PROGRESS')),
                       count(*) FILTER (WHERE status IN ('SCHEDULED', 'IN_PROGRESS') AND due_at < :now),
                       min(created_at) FILTER (WHERE status IN ('SCHEDULED', 'IN_PROGRESS')),
                       count(*) FILTER (WHERE status = 'SUBMITTED' AND submitted_at >= :since)
                FROM mnt_inspection_run WHERE inspector_id IN (:users)
                GROUP BY inspector_id
                """)
                .param("users", List.copyOf(userIds)).param("since", Timestamp.from(resolvedSince))
                .param("now", Timestamp.from(Instant.now(clock)))
                .query((rs, i) -> {
                    Timestamp oldest = rs.getTimestamp("oldest");
                    return new Part(rs.getLong("person"), rs.getString("type"), rs.getLong("open"), rs.getLong("overdue"),
                            oldest == null ? null : oldest.toInstant(), rs.getLong("resolved"));
                }).list();
        return merge(parts);
    }

    private static Map<Long, Load> merge(List<Part> parts) {
        Map<Long, Load> result = new HashMap<>();
        for (Part p : parts) {
            Map<String, Long> byType = p.open() > 0 ? Map.of(p.type(), p.open()) : Map.of();
            result.merge(p.person(), new Load(byType, p.overdue(), p.oldest(), p.resolved()), Load::plus);
        }
        return result;
    }
}
