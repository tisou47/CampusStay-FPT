package vn.fpt.campusstay.mnt.internal;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.auth.StaffWorkload;

/** Implements {@link StaffWorkload} for Maintenance Requests: open ones assigned, and resolved ones. */
@Component
class MaintenanceWorkload implements StaffWorkload {

    private final JdbcClient jdbc;

    MaintenanceWorkload(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<Long, Load> workload(Collection<Long> userIds, Instant resolvedSince) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql("""
                SELECT assignee_id,
                       count(*) FILTER (WHERE status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')) AS open,
                       count(*) FILTER (WHERE resolved_at >= :since) AS resolved
                FROM mnt_request WHERE assignee_id IN (:users)
                GROUP BY assignee_id
                """)
                .param("users", List.copyOf(userIds)).param("since", Timestamp.from(resolvedSince))
                .query((rs, i) -> Map.entry(rs.getLong("assignee_id"), new Load(rs.getLong("open"), rs.getLong("resolved"))))
                .list().stream().collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }
}
