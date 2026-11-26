package vn.fpt.campusstay.service.maintenance;

import java.util.List;

import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.search.SearchSource;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;

/** Maintenance Requests of the user's Blocks by code ({@code MR-000321}) or title; Staff find only their own. */
@Component
@Order(5)
@Transactional(readOnly = true)
class MaintenanceSearch implements SearchSource {

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;

    MaintenanceSearch(JdbcClient jdbc, CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    @Override
    public List<Hit> search(String q, Scope scope, int limit) {
        AuthenticatedUser user = currentUser.find().orElse(null);
        Long staff = user != null && user.role() == Role.STAFF ? user.userId() : null;
        return jdbc.sql("""
                SELECT code, title, room_code FROM mnt_request
                WHERE building_id IN (:blocks) AND (code ILIKE :start OR title ILIKE :anywhere)
                  AND (CAST(:staff AS BIGINT) IS NULL OR assignee_id = :staff)
                ORDER BY (code ILIKE :start) DESC, reported_at DESC LIMIT :limit
                """).param("blocks", List.copyOf(scope.blockIds())).param("start", SearchSource.like(q, false))
                .param("anywhere", SearchSource.like(q, true)).param("staff", staff).param("limit", limit)
                .query((rs, i) -> new Hit("maintenance", rs.getString("code"), rs.getString("title"),
                        rs.getString("code") + " · Room " + rs.getString("room_code")))
                .list();
    }
}
