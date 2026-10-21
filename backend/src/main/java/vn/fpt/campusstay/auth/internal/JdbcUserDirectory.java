package vn.fpt.campusstay.auth.internal;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.auth.UserDirectory;

@Component
@Transactional(readOnly = true)
class JdbcUserDirectory implements UserDirectory {

    private final JdbcClient jdbc;

    JdbcUserDirectory(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<Long, String> displayNames(Collection<Long> userIds) {
        Map<Long, String> result = new HashMap<>();
        if (userIds == null || userIds.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT id, display_name FROM auth_user WHERE id IN (:ids)")
                .param("ids", List.copyOf(userIds))
                .query((rs, i) -> Map.entry(rs.getLong("id"), rs.getString("display_name")))
                .list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    @Override
    public Map<Long, Student> students(Collection<Long> userIds) {
        Map<Long, Student> result = new HashMap<>();
        if (userIds == null || userIds.isEmpty()) {
            return result;
        }
        jdbc.sql("""
                SELECT u.id, u.display_name, s.student_code
                FROM auth_user u JOIN auth_student s ON s.user_id = u.id
                WHERE u.id IN (:ids)
                """)
                .param("ids", List.copyOf(userIds))
                .query((rs, i) -> new Student(rs.getLong("id"), rs.getString("display_name"),
                        rs.getString("student_code")))
                .list()
                .forEach(s -> result.put(s.userId(), s));
        return result;
    }

    @Override
    public Map<String, Long> studentsPerPriorityGroup() {
        Map<String, Long> result = new HashMap<>();
        jdbc.sql("""
                SELECT g.group_key, count(*) AS students
                FROM auth_student s CROSS JOIN LATERAL unnest(s.priority_groups) AS g(group_key)
                WHERE s.enrollment_status = 'ENROLLED'
                GROUP BY g.group_key
                """)
                .query((rs, i) -> Map.entry(rs.getString("group_key"), rs.getLong("students")))
                .list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    private static final String PROFILE = """
            SELECT u.id, u.display_name, u.email, s.student_code, s.gender, s.major, s.cohort, s.semester_no, s.hometown,
                   s.region, s.enrollment_status, s.priority_groups, s.phone, s.emergency_name,
                   s.emergency_relationship, s.emergency_phone
            FROM auth_user u JOIN auth_student s ON s.user_id = u.id
            """;

    @Override
    public Optional<StudentProfile> studentProfile(long userId) {
        return jdbc.sql(PROFILE + " WHERE u.id = :id").param("id", userId).query(JdbcUserDirectory::profile).optional();
    }

    @Override
    public Optional<StudentProfile> studentByCode(String studentCode) {
        if (studentCode == null || studentCode.isBlank()) {
            return Optional.empty();
        }
        return jdbc.sql(PROFILE + " WHERE upper(s.student_code) = upper(:code)").param("code", studentCode.trim())
                .query(JdbcUserDirectory::profile).optional();
    }

    @Override
    @Transactional
    public void saveStudentContact(long userId, String phone, String emergencyName, String emergencyRelationship,
            String emergencyPhone) {
        jdbc.sql("""
                UPDATE auth_student SET phone = :phone, emergency_name = :name, emergency_relationship = :relationship,
                       emergency_phone = :emergencyPhone
                WHERE user_id = :id
                """)
                .param("phone", phone).param("name", emergencyName).param("relationship", emergencyRelationship)
                .param("emergencyPhone", emergencyPhone).param("id", userId)
                .update();
    }

    private static StudentProfile profile(ResultSet rs, int i) throws SQLException {
        Array groups = rs.getArray("priority_groups");
        return new StudentProfile(rs.getLong("id"), rs.getString("display_name"), rs.getString("email"),
                rs.getString("student_code"), rs.getString("gender").trim(), rs.getString("major"),
                rs.getString("cohort"), rs.getObject("semester_no", Integer.class), rs.getString("hometown"),
                rs.getString("region"), rs.getString("enrollment_status"),
                groups == null ? List.of() : List.of((String[]) groups.getArray()), rs.getString("phone"),
                rs.getString("emergency_name"), rs.getString("emergency_relationship"), rs.getString("emergency_phone"));
    }
}
