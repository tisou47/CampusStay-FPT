package vn.fpt.campusstay.service.auth;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.service.auth.UserDirectory;

@Component
@Transactional(readOnly = true)
class JdbcUserDirectory implements UserDirectory {

    private final JdbcClient jdbc;

    JdbcUserDirectory(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String locale(long userId) {
        return jdbc.sql("SELECT locale FROM auth_user WHERE id = :id").param("id", userId).query(String.class)
                .optional().orElse(Locales.VI);
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
    public List<StaffMember> staffOf(Collection<Long> buildingIds) {
        if (buildingIds == null || buildingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                SELECT DISTINCT u.id, u.display_name, u.role, coalesce(p.handles, '{}') AS handles,
                       coalesce(p.on_duty, FALSE) AS on_duty
                FROM auth_user u
                JOIN auth_user_block b ON b.user_id = u.id
                LEFT JOIN auth_staff_profile p ON p.user_id = u.id
                WHERE b.building_id IN (:buildings) AND u.role IN ('STAFF', 'MANAGER') AND u.status = 'ACTIVE'
                ORDER BY u.display_name, u.id
                """)
                .param("buildings", List.copyOf(buildingIds))
                .query((rs, i) -> new StaffMember(rs.getLong("id"), rs.getString("display_name"), rs.getString("role"),
                        List.of((String[]) rs.getArray("handles").getArray()), rs.getBoolean("on_duty")))
                .list();
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

    @Override
    public StudentCounts studentCounts() {
        Map<String, Long> byGender = new HashMap<>();
        jdbc.sql("""
                SELECT trim(s.gender) AS gender, count(*) AS n FROM auth_student s JOIN auth_user u ON u.id = s.user_id
                WHERE u.status = 'ACTIVE' GROUP BY trim(s.gender)
                """)
                .query((rs, i) -> Map.entry(rs.getString("gender"), rs.getLong("n"))).list()
                .forEach(e -> byGender.put(e.getKey(), e.getValue()));
        return jdbc.sql("""
                SELECT count(*) AS students,
                       count(*) FILTER (WHERE s.enrollment_status <> 'ENROLLED') AS not_enrolled,
                       count(*) FILTER (WHERE s.verification <> 'VERIFIED') AS not_verified,
                       count(*) FILTER (WHERE coalesce(trim(s.phone), '') = ''
                                          OR coalesce(trim(s.emergency_name), '') = ''
                                          OR coalesce(trim(s.emergency_phone), '') = '') AS contact
                FROM auth_student s JOIN auth_user u ON u.id = s.user_id
                WHERE u.status = 'ACTIVE'
                """)
                .query((rs, i) -> new StudentCounts(rs.getLong("students"), rs.getLong("not_enrolled"),
                        rs.getLong("not_verified"), rs.getLong("contact"), byGender))
                .single();
    }

    @Override
    public List<Long> activeUserIds(String role) {
        return jdbc.sql("SELECT id FROM auth_user WHERE role = :role AND status = 'ACTIVE' ORDER BY id")
                .param("role", role).query(Long.class).list();
    }

    private static final String PROFILE = """
            SELECT u.id, u.display_name, u.email, s.student_code, s.gender, s.major, s.cohort, s.semester_no, s.hometown,
                   s.region, s.enrollment_status, s.priority_groups, s.phone, s.emergency_name,
                   s.emergency_relationship, s.emergency_phone, s.synced_at, s.verification
            FROM auth_user u JOIN auth_student s ON s.user_id = u.id
            """;

    @Override
    public Optional<StudentProfile> studentProfile(long userId) {
        return jdbc.sql(PROFILE + " WHERE u.id = :id").param("id", userId).query(JdbcUserDirectory::profile).optional();
    }

    @Override
    public Map<Long, StudentProfile> studentProfiles(Collection<Long> userIds) {
        Map<Long, StudentProfile> result = new HashMap<>();
        if (userIds == null || userIds.isEmpty()) {
            return result;
        }
        jdbc.sql(PROFILE + " WHERE u.id IN (:ids)").param("ids", List.copyOf(userIds))
                .query(JdbcUserDirectory::profile).list()
                .forEach(p -> result.put(p.userId(), p));
        return result;
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
    public Set<String> demoEmails(Collection<String> emails) {
        if (emails == null || emails.isEmpty()) {
            return Set.of();
        }
        return Set.copyOf(jdbc.sql("SELECT lower(email) FROM auth_user WHERE demo AND lower(email) IN (:emails)")
                .param("emails", emails.stream().map(e -> e.trim().toLowerCase(Locale.ROOT)).distinct().toList())
                .query(String.class).list());
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
                rs.getString("emergency_name"), rs.getString("emergency_relationship"), rs.getString("emergency_phone"),
                rs.getTimestamp("synced_at").toInstant(), rs.getString("verification"));
    }
}
