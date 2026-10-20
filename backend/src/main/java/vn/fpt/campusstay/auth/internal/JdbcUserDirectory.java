package vn.fpt.campusstay.auth.internal;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
}
