package vn.fpt.campusstay.service.auth;

import java.util.List;

import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.search.SearchSource;
import vn.fpt.campusstay.service.assignment.Residences;

/**
 * Students by code (from the start) or name (anywhere). Staff find only the students who live in their Blocks,
 * like their student list (Permission {@code VIEW_STUDENTS}).
 */
@Component
@Order(1)
@Transactional(readOnly = true)
class StudentSearch implements SearchSource {

    private record Row(long id, String name, String code, String cohort) {
    }

    private final JdbcClient jdbc;
    private final Residences residences;

    StudentSearch(JdbcClient jdbc, Residences residences) {
        this.jdbc = jdbc;
        this.residences = residences;
    }

    @Override
    public List<Hit> search(String q, Scope scope, int limit) {
        List<Row> rows = jdbc.sql("""
                SELECT u.id, u.display_name, s.student_code, s.cohort FROM auth_user u JOIN auth_student s ON s.user_id = u.id
                WHERE u.role = 'STUDENT' AND (s.student_code ILIKE :start OR u.display_name ILIKE :anywhere)
                ORDER BY (s.student_code ILIKE :start) DESC, s.student_code LIMIT :limit
                """).param("start", SearchSource.like(q, false)).param("anywhere", SearchSource.like(q, true))
                .param("limit", scope.everyBlock() ? limit : limit * 10)
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getString("display_name"), rs.getString("student_code"),
                        rs.getString("cohort")))
                .list();
        return rows.stream()
                .filter(r -> scope.everyBlock() || residences.current(r.id())
                        .filter(home -> home.resident() && scope.blockIds().contains(home.buildingId())).isPresent())
                .limit(limit)
                .map(r -> new Hit("student", String.valueOf(r.id()), r.name(),
                        r.code() + (r.cohort() == null ? "" : " · " + r.cohort())))
                .toList();
    }
}
