package vn.fpt.campusstay.service.auth;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.Actor;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.exception.ApiException;

/**
 * Google sign-up (ADR-26, spec §6.1): the first Google sign-in of an {@code @fpt.edu.vn} account that CampusStay
 * does not know creates a student account. When the address ends with a student code of the imported student list
 * whose account has not been used yet, that account is the student's: it is linked to Google and is Verified.
 * Otherwise the new account has no directory record until the student sends the sign-up form. Either way the
 * account has no password yet, so the next step is Set a password.
 */
@Service
class StudentSignUp {

    private record Imported(long id, String googleSub, boolean used) {
    }

    private final JdbcClient jdbc;
    private final AuditLog audit;

    StudentSignUp(JdbcClient jdbc, AuditLog audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    /** @return the account the Google identity signs in to, already linked to it */
    @Transactional
    long signUp(GoogleIdTokenVerifier.GoogleIdentity identity) {
        String email = identity.email().toLowerCase(Locale.ROOT);
        Optional<String> code = StudentCodes.fromEmail(email);
        if (code.isPresent()) {
            Optional<Imported> imported = jdbc.sql("""
                    SELECT u.id, u.google_sub, u.last_sign_in_at IS NOT NULL OR u.password_hash IS NOT NULL AS used
                    FROM auth_user u JOIN auth_student s ON s.user_id = u.id
                    WHERE s.student_code = :code AND u.role = 'STUDENT' AND NOT u.demo
                    FOR UPDATE OF u
                    """).param("code", code.get())
                    .query((rs, i) -> new Imported(rs.getLong("id"), rs.getString("google_sub"), rs.getBoolean("used")))
                    .optional();
            if (imported.isPresent()) {
                return claim(imported.get(), identity, email, code.get());
            }
        }
        String name = identity.name() != null && !identity.name().isBlank() ? identity.name().strip()
                : email.substring(0, email.indexOf('@'));
        String locale = Locales.requested() != null ? Locales.requested() : Locales.VI;
        long id = jdbc.sql("""
                INSERT INTO auth_user (email, display_name, role, status, google_sub, locale)
                VALUES (:email, :name, 'STUDENT', 'INVITED', :sub, :locale) RETURNING id
                """)
                .param("email", email).param("name", name.length() > 150 ? name.substring(0, 150) : name)
                .param("sub", identity.subject()).param("locale", locale)
                .query(Long.class).single();
        audit.record(new Actor(id, name), "ACCOUNT_SIGNED_UP", AuditLog.Tone.INFO, "User", id, email,
                Map.of("method", "GOOGLE"));
        return id;
    }

    /**
     * An account of the student list waiting for its student: the code in the FPT address shows whose it is. Its
     * email becomes the Google address unless the account was already used with its own.
     */
    private long claim(Imported account, GoogleIdTokenVerifier.GoogleIdentity identity, String email, String code) {
        if (account.googleSub() != null && !account.googleSub().equals(identity.subject())) {
            throw ApiException.forbidden("GOOGLE_ACCOUNT_MISMATCH",
                    "This account is linked to a different Google account. Contact the dormitory office.");
        }
        jdbc.sql("""
                UPDATE auth_user SET google_sub = :sub, email = CASE WHEN :used THEN email ELSE :email END,
                       updated_at = now(), version = version + 1
                WHERE id = :id
                """).param("sub", identity.subject()).param("used", account.used()).param("email", email)
                .param("id", account.id()).update();
        audit.record(new Actor(account.id(), identity.name() == null ? email : identity.name()), "GOOGLE_LINKED",
                AuditLog.Tone.INFO, "User", account.id(), email, Map.of("studentCode", code));
        return account.id();
    }
}
