package vn.fpt.campusstay.service.request;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.search.SearchSource;
import vn.fpt.campusstay.service.auth.UserDirectory;

/**
 * Requests of the user's Blocks by code: Room-Change Requests ({@code RC-…}), swaps ({@code SW-…}), Room Class
 * changes ({@code CC-…}) and extension or end-of-stay requests ({@code ST-…}).
 */
@Component
@Order(6)
@Transactional(readOnly = true)
class RequestSearch implements SearchSource {

    private record Row(String kind, String code, Long studentId, String detail) {
    }

    private final JdbcClient jdbc;
    private final UserDirectory users;

    RequestSearch(JdbcClient jdbc, UserDirectory users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    @Override
    public List<Hit> search(String q, Scope scope, int limit) {
        String start = SearchSource.like(q, false);
        List<Long> blocks = List.copyOf(scope.blockIds());
        List<Row> rows = new ArrayList<>();
        rows.addAll(jdbc.sql("""
                SELECT code, student_id FROM req_room_change WHERE building_id IN (:blocks) AND code ILIKE :start
                ORDER BY submitted_at DESC LIMIT :limit
                """).param("blocks", blocks).param("start", start).param("limit", limit)
                .query((rs, i) -> new Row("room-change", rs.getString("code"), rs.getLong("student_id"),
                        "Room-Change Request")).list());
        rows.addAll(jdbc.sql("""
                SELECT code, student_id, kind FROM req_stay_request WHERE building_id IN (:blocks) AND code ILIKE :start
                ORDER BY submitted_at DESC LIMIT :limit
                """).param("blocks", blocks).param("start", start).param("limit", limit)
                .query((rs, i) -> new Row("stay-request", rs.getString("code"), rs.getLong("student_id"),
                        "EXTENSION".equals(rs.getString("kind")) ? "Extension" : "End of stay")).list());
        rows.addAll(jdbc.sql("""
                SELECT code FROM req_room_class_change WHERE building_id IN (:blocks) AND code ILIKE :start
                ORDER BY submitted_at DESC LIMIT :limit
                """).param("blocks", blocks).param("start", start).param("limit", limit)
                .query((rs, i) -> new Row("room-class-change", rs.getString("code"), null, "Room Class change"))
                .list());
        String digits = q.toUpperCase(Locale.ROOT).startsWith("SW-") ? q.substring(3).replaceFirst("^0+", "") : "";
        if (!digits.isEmpty() && digits.length() < 19 && digits.chars().allMatch(Character::isDigit)) {
            rows.addAll(jdbc.sql("""
                    SELECT id FROM req_swap WHERE (a_building_id IN (:blocks) OR b_building_id IN (:blocks))
                      AND id::text LIKE :start ORDER BY id DESC LIMIT :limit
                    """).param("blocks", blocks).param("start", digits + "%").param("limit", limit)
                    .query((rs, i) -> new Row("swap", SwapService.code(rs.getLong("id")), null, "Room swap")).list());
        }
        Map<Long, String> names = users.displayNames(rows.stream().map(Row::studentId).filter(id -> id != null)
                .collect(Collectors.toSet()));
        return rows.stream().limit(limit)
                .map(r -> new Hit(r.kind(), r.code(), r.code(),
                        r.studentId() == null ? r.detail() : r.detail() + " · " + names.get(r.studentId())))
                .toList();
    }
}
