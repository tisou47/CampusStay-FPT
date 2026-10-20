package vn.fpt.campusstay.auth.internal;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.auth.AuthenticatedUser;
import vn.fpt.campusstay.auth.PasswordResetRequested;
import vn.fpt.campusstay.shared.audit.Actor;
import vn.fpt.campusstay.shared.audit.AuditLog;
import vn.fpt.campusstay.shared.error.ApiException;
import vn.fpt.campusstay.shared.security.Tokens;

/** Forgot / reset / change password, and setting the first password from an invitation. */
@Service
public class PasswordService {

    private final UserRepository users;
    private final ActionTokenRepository tokens;
    private final SessionService sessions;
    private final PasswordEncoder encoder;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final AuthProperties props;
    private final Clock clock;

    public PasswordService(UserRepository users, ActionTokenRepository tokens, SessionService sessions,
            PasswordEncoder encoder, ApplicationEventPublisher events, AuditLog audit, AuthProperties props,
            Clock clock) {
        this.users = users;
        this.tokens = tokens;
        this.sessions = sessions;
        this.encoder = encoder;
        this.events = events;
        this.audit = audit;
        this.props = props;
        this.clock = clock;
    }

    /**
     * Always succeeds from the caller's point of view, so the endpoint does not
     * reveal which emails have accounts. At most {@code resetRequestsPerHour} links per hour.
     */
    @Transactional
    public void requestReset(String email) {
        users.findByEmailIgnoreCase(email.trim())
                .filter(u -> u.getStatus() != UserEntity.Status.DISABLED)
                .ifPresent(user -> {
                    Instant now = Instant.now(clock);
                    long recent = tokens.countRecent(user.getId(), ActionTokenEntity.Purpose.PASSWORD_RESET,
                            now.minus(Duration.ofHours(1)));
                    if (recent >= props.resetRequestsPerHour()) {
                        return;
                    }
                    issue(user, ActionTokenEntity.Purpose.PASSWORD_RESET, props.resetTokenTtl(), now);
                });
    }

    /** Called by the Admin invite flow (AUTH users slice). */
    @Transactional
    public void sendInvitation(long userId) {
        UserEntity user = users.findById(userId).orElseThrow(() -> ApiException.notFound("This user does not exist."));
        issue(user, ActionTokenEntity.Purpose.INVITE, props.inviteTokenTtl(), Instant.now(clock));
    }

    /** Sets a new password from a reset or invitation link, then signs the user out everywhere. */
    @Transactional
    public void resetWithToken(String rawToken, String newPassword) {
        Instant now = Instant.now(clock);
        ActionTokenEntity token = tokens.findForUpdate(Tokens.sha256Hex(rawToken))
                .filter(t -> t.usableAt(now))
                .orElseThrow(() -> ApiException.badRequest("LINK_INVALID",
                        "This link is invalid or has expired. Request a new one."));
        UserEntity user = users.findById(token.getUserId()).orElseThrow();
        if (user.getStatus() == UserEntity.Status.DISABLED) {
            throw ApiException.forbidden("ACCOUNT_DISABLED", "This account is disabled. Contact the dormitory office.");
        }
        PasswordPolicy.check(newPassword, user.getEmail());
        user.changePassword(encoder.encode(newPassword));
        token.markUsed(now);
        sessions.revokeAll(user.getId());
        audit.record(new Actor(user.getId(), user.getDisplayName()),
                token.getPurpose() == ActionTokenEntity.Purpose.INVITE ? "ACCOUNT_ACTIVATED" : "PASSWORD_RESET",
                AuditLog.Tone.INFO, "User", user.getId(), user.getEmail(), null);
    }

    /** Changes the password of the signed-in user and signs out their other sessions. */
    @Transactional
    public void change(AuthenticatedUser current, String currentPassword, String newPassword) {
        UserEntity user = users.findById(current.userId()).orElseThrow();
        if (user.getPasswordHash() == null || !encoder.matches(currentPassword, user.getPasswordHash())) {
            throw ApiException.badRequest("WRONG_PASSWORD", "The current password is incorrect.",
                    Map.of("fields", Map.of("currentPassword", "The current password is incorrect.")));
        }
        PasswordPolicy.check(newPassword, user.getEmail());
        user.changePassword(encoder.encode(newPassword));
        sessions.revokeOthers(user.getId(), current.sessionId());
        audit.record("PASSWORD_CHANGED", AuditLog.Tone.INFO, "User", user.getId(), user.getEmail(), null);
    }

    private void issue(UserEntity user, ActionTokenEntity.Purpose purpose, Duration ttl, Instant now) {
        tokens.invalidateOpen(user.getId(), purpose, now);
        String raw = Tokens.newToken();
        Instant expiresAt = now.plus(ttl);
        tokens.save(new ActionTokenEntity(Tokens.sha256Hex(raw), user.getId(), purpose, now, expiresAt));
        String path = purpose == ActionTokenEntity.Purpose.INVITE ? "/set-password" : "/reset-password";
        String link = props.webBaseUrl() + path + "?token=" + raw;
        events.publishEvent(new PasswordResetRequested(user.getId(), user.getEmail(), user.getDisplayName(),
                purpose.name(), link, expiresAt));
    }
}
