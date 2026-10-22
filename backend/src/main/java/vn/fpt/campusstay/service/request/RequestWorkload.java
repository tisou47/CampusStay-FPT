package vn.fpt.campusstay.service.request;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.auth.StaffWorkload;

/** Implements {@link StaffWorkload} for Room-Change Requests (open ones assigned) and decisions on changes and swaps. */
@Component
class RequestWorkload implements StaffWorkload {

    private final JdbcClient jdbc;

    RequestWorkload(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<Long, Load> workload(Collection<Long> userIds, Instant resolvedSince) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql("""
                SELECT person, sum(open) AS open, sum(resolved) AS resolved FROM (
                    SELECT assignee_id AS person, 1 AS open, 0 AS resolved FROM req_room_change
                    WHERE assignee_id IN (:users) AND status IN ('SUBMITTED', 'PENDING')
                    UNION ALL
                    SELECT decided_by, 0, 1 FROM req_room_change WHERE decided_by IN (:users) AND decided_at >= :since
                    UNION ALL
                    SELECT decided_by, 0, 1 FROM req_swap WHERE decided_by IN (:users) AND decided_at >= :since
                    UNION ALL
                    SELECT staff_decided_by, 0, 1 FROM req_swap
                    WHERE staff_decided_by IN (:users) AND staff_decided_at >= :since
                ) w GROUP BY person
                """)
                .param("users", List.copyOf(userIds)).param("since", Timestamp.from(resolvedSince))
                .query((rs, i) -> Map.entry(rs.getLong("person"), new Load(rs.getLong("open"), rs.getLong("resolved"))))
                .list().stream().collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }
}
