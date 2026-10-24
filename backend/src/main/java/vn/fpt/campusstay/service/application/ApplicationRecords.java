package vn.fpt.campusstay.service.application;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.repository.application.ApplicationStore;
import vn.fpt.campusstay.service.auth.StudentRecords;
import vn.fpt.campusstay.service.setting.TermCatalog;

/** The student hub's Applications (implements Auth's {@link StudentRecords}). */
@Component
@Transactional(readOnly = true)
class ApplicationRecords implements StudentRecords {

    private final JdbcClient jdbc;
    private final TermCatalog terms;

    ApplicationRecords(JdbcClient jdbc, TermCatalog terms) {
        this.jdbc = jdbc;
        this.terms = terms;
    }

    @Override
    public String section() {
        return "applications";
    }

    @Override
    public List<Item> of(long studentId, int limit) {
        Map<Long, String> names = terms.publishedTerms().stream()
                .collect(Collectors.toMap(TermSummary::id, TermSummary::name, (a, b) -> a));
        return jdbc.sql("""
                SELECT code, term_id, status, deposit_amount, created_at FROM app_application
                WHERE student_id = :student AND status <> 'DRAFT' ORDER BY created_at DESC, id DESC LIMIT :limit
                """).param("student", studentId).param("limit", limit)
                .query((rs, i) -> new Item("application", rs.getString("code"), rs.getString("code"),
                        names.get(rs.getLong("term_id")), ApplicationStore.label(rs.getString("status")), null,
                        rs.getTimestamp("created_at").toInstant()))
                .list();
    }
}
