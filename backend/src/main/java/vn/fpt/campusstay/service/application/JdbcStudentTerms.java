package vn.fpt.campusstay.service.application;

import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.setting.StudentTerms;

/** Implements Settings's {@link StudentTerms} port from the student's live Applications. */
@Component
@Transactional(readOnly = true)
class JdbcStudentTerms implements StudentTerms {

    private final JdbcClient jdbc;

    JdbcStudentTerms(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<LiveApplication> liveApplications(long studentId) {
        return jdbc.sql("""
                SELECT term_id, status = 'ALLOCATED' AS allocated FROM app_application
                WHERE student_id = :student AND status NOT IN ('REJECTED', 'CANCELLED', 'EXPIRED')
                """)
                .param("student", studentId)
                .query((rs, i) -> new LiveApplication(rs.getLong("term_id"), rs.getBoolean("allocated")))
                .list();
    }
}
