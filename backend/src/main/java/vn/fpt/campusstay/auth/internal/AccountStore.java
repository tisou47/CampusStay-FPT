package vn.fpt.campusstay.auth.internal;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.shared.audit.Actor;
import vn.fpt.campusstay.shared.audit.AuditLog;

/**
 * Account state changes made during sign-in. Failure bookkeeping runs in its own
 * transaction so it is kept even though the sign-in request then fails.
 */
@Component
class AccountStore {

    private final UserRepository users;
    private final AuditLog audit;
    private final AuthProperties props;
    private final Clock clock;

    AccountStore(UserRepository users, AuditLog audit, AuthProperties props, Clock clock) {
        this.users = users;
        this.audit = audit;
        this.props = props;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    Optional<UserEntity> findByEmail(String email) {
        return users.findByEmailIgnoreCase(email.trim());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void recordFailure(UserEntity user, String method) {
        users.incrementFailedAttempts(user.getId());
        Instant until = Instant.now(clock).plus(props.lockDuration());
        boolean locked = users.lockIfOverLimit(user.getId(), props.maxFailedAttempts(), until) > 0;
        audit.record(new Actor(user.getId(), user.getDisplayName()), locked ? "ACCOUNT_LOCKED" : "SIGN_IN_FAILED",
                locked ? AuditLog.Tone.DANGER : AuditLog.Tone.WARNING, "User", user.getId(), user.getEmail(),
                Map.of("method", method));
    }

    @Transactional
    UserEntity recordSuccess(long userId, String method, String googleSubToLink) {
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
