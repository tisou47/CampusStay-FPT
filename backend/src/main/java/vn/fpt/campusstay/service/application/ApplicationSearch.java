package vn.fpt.campusstay.service.application;

import java.util.List;
import java.util.Map;

import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.search.SearchSource;
import vn.fpt.campusstay.service.auth.UserDirectory;

/** Applications by code ({@code APP-SP27-000123}), for Managers and the Admin, who review them (ADR-19). */
@Component
@Order(4)
@Transactional(readOnly = true)
class ApplicationSearch implements SearchSource {

    private record Row(String code, long studentId) {
    }

    private final JdbcClient jdbc;
    private final UserDirectory users;

    ApplicationSearch(JdbcClient jdbc, UserDirectory users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    @Override
    public List<Hit> search(String q, Scope scope, int limit) {
        if (!scope.everyBlock()) {
            return List.of();
        }
        List<Row> rows = jdbc.sql("""
                SELECT code, student_id FROM app_application WHERE code ILIKE :start ORDER BY created_at DESC LIMIT :limit
                """).param("start", SearchSource.like(q, false)).param("limit", limit)
                .query((rs, i) -> new Row(rs.getString("code"), rs.getLong("student_id"))).list();
        Map<Long, String> names = users.displayNames(rows.stream().map(Row::studentId).distinct().toList());
        return rows.stream().map(r -> new Hit("application", r.code(), r.code(), names.get(r.studentId()))).toList();
    }
}
