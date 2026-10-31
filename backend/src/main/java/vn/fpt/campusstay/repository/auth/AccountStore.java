package vn.fpt.campusstay.repository.auth;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.Actor;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.AuthProperties;
import vn.fpt.campusstay.entity.UserEntity;
import vn.fpt.campusstay.repository.UserRepository;

/**
 * Account state changes made during sign-in. Failure bookkeeping runs in its own
 * transaction so it is kept even though the sign-in request then fails.
 */
@Component
public class AccountStore {

    private final UserRepository users;
    private final JdbcClient jdbc;
    private final AuditLog audit;
    private final AuthProperties props;
    private final Clock clock;

    public AccountStore(UserRepository users, JdbcClient jdbc, AuditLog audit, AuthProperties props, Clock clock) {
        this.users = users;
        this.jdbc = jdbc;
        this.audit = audit;
        this.props = props;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Optional<UserEntity> findByEmail(String email) {
        return users.findByEmailIgnoreCase(email.trim());
    }

    /** A fictional account of the base data (dev seed, demo server), {@code auth_user.demo}. */
    @Transactional(readOnly = true)
    public boolean isDemo(long userId) {
        return jdbc.sql("SELECT demo FROM auth_user WHERE id = :id").param("id", userId).query(Boolean.class).single();
    }

    /** The reason a Manager gave when rejecting this student account (spec §6.1), if it was rejected. */
    @Transactional(readOnly = true)
    public Optional<String> rejectionReason(long userId) {
        return jdbc.sql("SELECT coalesce(verification_note, '') FROM auth_student WHERE user_id = :id AND verification = 'REJECTED'")
                .param("id", userId).query(String.class).optional();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(UserEntity user, String method) {
        users.incrementFailedAttempts(user.getId());
        Instant until = Instant.now(clock).plus(props.lockDuration());
        boolean locked = users.lockIfOverLimit(user.getId(), props.maxFailedAttempts(), until) > 0;
        audit.record(new Actor(user.getId(), user.getDisplayName()), locked ? "ACCOUNT_LOCKED" : "SIGN_IN_FAILED",
                locked ? AuditLog.Tone.DANGER : AuditLog.Tone.WARNING, "User", user.getId(), user.getEmail(),
                Map.of("method", method));
    }

    @Transactional
    public UserEntity recordSuccess(long userId, String method, String googleSubToLink) {
        UserEntity user = users.findById(userId).orElseThrow();
        if (googleSubToLink != null && user.getGoogleSub() == null) {
            user.linkGoogle(googleSubToLink);
        }
        user.recordSignIn(Instant.now(clock));
        audit.record(new Actor(user.getId(), user.getDisplayName()), "SIGN_IN", AuditLog.Tone.INFO, "User",
                user.getId(), user.getEmail(), Map.of("method", method));
        return user;
    }
}
