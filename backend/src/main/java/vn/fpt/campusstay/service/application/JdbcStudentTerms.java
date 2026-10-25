package vn.fpt.campusstay.service.application;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    @Override
    public Map<String, Long> liveApplicationsByChoice(long termId) {
        Map<String, Long> result = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT room_type_id, room_class_id, trim(gender) AS gender, count(*) AS n FROM app_application
                WHERE term_id = :term AND status NOT IN ('REJECTED', 'CANCELLED', 'EXPIRED', 'DRAFT')
                GROUP BY room_type_id, room_class_id, trim(gender)
                """)
                .param("term", termId)
                .query((rs, i) -> Map.entry(rs.getLong("room_type_id") + ":" + rs.getLong("room_class_id") + ":"
                        + rs.getString("gender"), rs.getLong("n")))
                .list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }
}
