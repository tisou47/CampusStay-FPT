package vn.fpt.campusstay.service.inventory;

import java.util.List;

import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.search.SearchSource;

/** Rooms of the user's Blocks by code, with or without the dash ({@code A-501}, {@code A501}). */
@Component
@Order(2)
@Transactional(readOnly = true)
class RoomSearch implements SearchSource {

    private final JdbcClient jdbc;

    RoomSearch(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Hit> search(String q, Scope scope, int limit) {
        return jdbc.sql("""
                SELECT r.code, b.name AS block, f.floor_no FROM inv_room r
                JOIN inv_building b ON b.id = r.building_id JOIN inv_floor f ON f.id = r.floor_id
                WHERE r.status <> 'RETIRED' AND r.building_id IN (:blocks)
                  AND (r.code ILIKE :start OR replace(r.code, '-', '') ILIKE :start)
                ORDER BY length(r.code), r.code LIMIT :limit
                """).param("blocks", List.copyOf(scope.blockIds())).param("start", SearchSource.like(q, false))
                .param("limit", limit)
                .query((rs, i) -> new Hit("room", rs.getString("code"), "Room " + rs.getString("code"),
                        rs.getString("block") + " · Floor " + rs.getInt("floor_no")))
                .list();
    }
}
