package vn.fpt.campusstay.service.request;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.assignment.OpenRenewalRequests;

/**
 * Implements Assignment's {@link OpenRenewalRequests} from the next-Term requests of a Term still waiting for a
 * decision: room changes, agreed swaps, Room Class changes (also those still collecting consents) and extensions.
 * A swap invitation nobody answered yet does not count: it expires on its own.
 */
@Component
@Transactional(readOnly = true)
class JdbcOpenRenewalRequests implements OpenRenewalRequests {

    private final JdbcClient jdbc;

    JdbcOpenRenewalRequests(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<String, Long> open(long termId) {
        Map<String, Long> result = new LinkedHashMap<>();
        put(result, "roomChanges", "SELECT count(*) FROM req_room_change WHERE term_id = :t AND status IN ('SUBMITTED', 'PENDING')",
                termId);
        put(result, "swaps", "SELECT count(*) FROM req_swap WHERE term_id = :t AND status IN ('PENDING', 'TO_MANAGER')",
                termId);
        put(result, "roomClassChanges", """
                SELECT count(*) FROM req_room_class_change WHERE term_id = :t AND status IN ('AWAITING_CONSENT', 'SUBMITTED')
                """, termId);
        put(result, "extensions", "SELECT count(*) FROM req_stay_request WHERE term_id = :t AND status = 'SUBMITTED'",
                termId);
        return result;
    }

    private void put(Map<String, Long> result, String kind, String sql, long termId) {
        long n = jdbc.sql(sql).param("t", termId).query(Long.class).single();
        if (n > 0) {
            result.put(kind, n);
        }
    }
}
