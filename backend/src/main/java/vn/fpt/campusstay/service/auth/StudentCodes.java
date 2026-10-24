package vn.fpt.campusstay.service.auth;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;

/**
 * Student codes: two letters and six digits ({@code SE190421}), stored in upper case. An FPT student address ends
 * with the code ({@code anhnvse190421@fpt.edu.vn}), which is how Google sign-up finds the student in the imported
 * list (spec §6.1).
 * <p>The fictional base data uses codes of the same form, so a real student may need a code a fictional account
 * holds. Real people win: the fictional account keeps working under {@code DEMO-<code>} (spec O-3).
 */
@Component
class StudentCodes {

    record Holder(long userId, boolean demo) {
    }

    private static final Pattern CODE = Pattern.compile("[A-Z]{2}\\d{6}");
    private static final Pattern IN_EMAIL = Pattern.compile("([a-z]{2}\\d{6})@[^@]+$");
    static final String DEMO_PREFIX = "DEMO-";

    private final JdbcClient jdbc;
    private final AuditLog audit;

    StudentCodes(JdbcClient jdbc, AuditLog audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    /** The code in upper case when it has the form of a student code, else empty. */
    static Optional<String> normalize(String value) {
        if (value == null) {
            return Optional.empty();
        }
        String code = value.strip().toUpperCase(Locale.ROOT);
        return CODE.matcher(code).matches() ? Optional.of(code) : Optional.empty();
    }

    /** The student code an FPT address ends with, if any. */
    static Optional<String> fromEmail(String email) {
        if (email == null) {
            return Optional.empty();
        }
        Matcher m = IN_EMAIL.matcher(email.strip().toLowerCase(Locale.ROOT));
        return m.find() ? Optional.of(m.group(1).toUpperCase(Locale.ROOT)) : Optional.empty();
    }

    /** The account whose directory record has this code (exact, upper case). */
    @Transactional(propagation = Propagation.MANDATORY)
    Optional<Holder> holder(String code) {
        return jdbc.sql("""
                SELECT u.id, u.demo FROM auth_student s JOIN auth_user u ON u.id = s.user_id
                WHERE s.student_code = :code
                """).param("code", code)
                .query((rs, i) -> new Holder(rs.getLong("id"), rs.getBoolean("demo"))).optional();
    }

    /** Frees the code for a real student when a fictional account holds it; a no-op otherwise. */
    @Transactional(propagation = Propagation.MANDATORY)
    void releaseFromDemo(String code) {
        holder(code).filter(Holder::demo).ifPresent(h -> {
            jdbc.sql("UPDATE auth_student SET student_code = :renamed WHERE user_id = :id")
                    .param("renamed", DEMO_PREFIX + code).param("id", h.userId()).update();
            audit.record("DEMO_STUDENT_CODE_RELEASED", AuditLog.Tone.INFO, "User", h.userId(), code,
                    Map.of("studentCode", List.of(code, DEMO_PREFIX + code)));
        });
    }
}
