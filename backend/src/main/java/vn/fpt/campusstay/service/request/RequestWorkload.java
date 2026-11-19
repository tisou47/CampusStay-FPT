package vn.fpt.campusstay.service.request;

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
 * Implements {@link StaffWorkload} for Room-Change Requests (open ones assigned, overdue past their due time) and
 * decisions on changes and swaps.
 */
@Component
class RequestWorkload implements StaffWorkload {

    private final JdbcClient jdbc;
    private final Clock clock;

    RequestWorkload(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Override
    public Map<Long, Load> workload(Collection<Long> userIds, Instant resolvedSince) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, Load> result = new HashMap<>();
        jdbc.sql("""
                SELECT person, sum(open) AS open, sum(overdue) AS overdue, min(opened) AS oldest,
                       sum(resolved) AS resolved FROM (
                    SELECT assignee_id AS person, 1 AS open, CASE WHEN sla_due_at < :now THEN 1 ELSE 0 END AS overdue,
                           submitted_at AS opened, 0 AS resolved
                    FROM req_room_change WHERE assignee_id IN (:users) AND status IN ('SUBMITTED', 'PENDING')
                    UNION ALL
                    SELECT decided_by, 0, 0, NULL, 1 FROM req_room_change WHERE decided_by IN (:users) AND decided_at >= :since
                    UNION ALL
                    SELECT decided_by, 0, 0, NULL, 1 FROM req_swap WHERE decided_by IN (:users) AND decided_at >= :since
                    UNION ALL
                    SELECT staff_decided_by, 0, 0, NULL, 1 FROM req_swap
                    WHERE staff_decided_by IN (:users) AND staff_decided_at >= :since
                ) w GROUP BY person
                """)
                .param("users", List.copyOf(userIds)).param("since", Timestamp.from(resolvedSince))
                .param("now", Timestamp.from(Instant.now(clock)))
                .query((rs, i) -> {
                    long open = rs.getLong("open");
                    Timestamp oldest = rs.getTimestamp("oldest");
                    return Map.entry(rs.getLong("person"), new Load(open > 0 ? Map.of(ROOM_CHANGE, open) : Map.of(),
                            rs.getLong("overdue"), oldest == null ? null : oldest.toInstant(), rs.getLong("resolved")));
                }).list().forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }
}
