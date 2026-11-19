package vn.fpt.campusstay.service.request;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.auth.BlockQueues;

/**
 * Implements {@link BlockQueues} for Requests: agreed swaps waiting for Staff (either Bed in the Blocks) and next-Term
 * requests (extensions and ends of stay) waiting for a decision.
 */
@Component
class RequestBlockQueues implements BlockQueues {

    private final JdbcClient jdbc;

    RequestBlockQueues(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<String, Long> waiting(Collection<Long> buildingIds) {
        Map<String, Long> result = new LinkedHashMap<>();
        if (buildingIds.isEmpty()) {
            return result;
        }
        List<Long> blocks = List.copyOf(buildingIds);
        result.put(SWAP_WAITING_STAFF, jdbc.sql("""
                SELECT count(*) FROM req_swap
                WHERE status = 'PENDING' AND (a_building_id IN (:b) OR b_building_id IN (:b))
                """).param("b", blocks).query(Long.class).single());
        result.put(NEXT_TERM_WAITING, jdbc.sql("""
                SELECT count(*) FROM req_stay_request WHERE status = 'SUBMITTED' AND building_id IN (:b)
                """).param("b", blocks).query(Long.class).single());
        return result;
    }
}
