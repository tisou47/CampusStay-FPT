package vn.fpt.campusstay.service.auth;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.security.Tokens;
import vn.fpt.campusstay.common.RequestInfo;
import vn.fpt.campusstay.config.AuthProperties;
import vn.fpt.campusstay.entity.SessionEntity;
import vn.fpt.campusstay.repository.SessionRepository;

/**
 * Opaque bearer sessions (ADR-07). The raw token is returned once at sign-in;
 * the database keeps only its SHA-256. Expiry slides on use (idle timeout) but
 * never beyond {@code sessionAbsoluteMax} after sign-in.
 */
@Service
public class SessionService {

    public record NewSession(String token, long sessionId, Instant expiresAt) {
    }

    private final SessionRepository sessions;
    private final JdbcClient jdbc;
    private final AuthProperties props;
    private final Clock clock;
    private final BlockDirectory blocks;

    public SessionService(SessionRepository sessions, JdbcClient jdbc, AuthProperties props, Clock clock,
            BlockDirectory blocks) {
        this.sessions = sessions;
        this.jdbc = jdbc;
        this.props = props;
        this.clock = clock;
        this.blocks = blocks;
    }

    @Transactional
    public NewSession create(long userId, boolean remember, SessionEntity.Method method) {
        Instant now = Instant.now(clock);
        String token = Tokens.newToken();
        Instant expiresAt = now.plus(ttl(remember));
        SessionEntity session = sessions.save(new SessionEntity(Tokens.sha256Hex(token), userId, remember, method, now,
                expiresAt, RequestInfo.userAgent(), RequestInfo.ip()));
        return new NewSession(token, session.getId(), expiresAt);
    }

    /**
     * Resolves a bearer token to the signed-in user, or empty when the token is
     * unknown, revoked, expired, or the account is no longer active.
     */
    @Transactional
    public Optional<AuthenticatedUser> authenticate(String rawToken) {
        if (rawToken == null || rawToken.isBlank() || rawToken.length() > 100) {
            return Optional.empty();
        }
        Instant now = Instant.now(clock);
        Optional<SessionRow> found = jdbc.sql("""
                SELECT s.id, s.user_id, s.remember, s.created_at, s.last_used_at, s.expires_at,
                       u.email, u.display_name, u.role, u.title, u.locale, u.password_hash IS NOT NULL AS password_set,
                       st.student_code, st.verification
                FROM auth_session s
                JOIN auth_user u ON u.id = s.user_id
                LEFT JOIN auth_student st ON st.user_id = u.id
                WHERE s.token_hash = :hash AND s.revoked_at IS NULL AND s.expires_at > :now
                  AND u.status = 'ACTIVE'
                """)
                .param("hash", Tokens.sha256Hex(rawToken))
                .param("now", Timestamp.from(now))
                .query((rs, i) -> new SessionRow(
                        rs.getLong("id"), rs.getLong("user_id"), rs.getBoolean("remember"),
                        rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("last_used_at").toInstant(),
                        rs.getString("email"), rs.getString("display_name"), Role.valueOf(rs.getString("role")),
                        rs.getString("title"), rs.getString("locale"), rs.getBoolean("password_set"),
                        rs.getString("student_code"), rs.getString("verification")))
                .optional();
        if (found.isEmpty()) {
            return Optional.empty();
        }
        SessionRow row = found.get();
        touchIfDue(row, now);

        Set<Long> blockIds = new HashSet<>();
        if (row.role() == Role.STAFF) {
            blockIds.addAll(jdbc.sql("SELECT building_id FROM auth_user_block WHERE user_id = :id")
                    .param("id", row.userId()).query(Long.class).list());
        } else if (row.role() == Role.MANAGER) {
            blockIds.addAll(blocks.allActiveIds()); // Managers work for every Block (ADR-19)
        }
        String verification = row.role() != Role.STUDENT ? null
                : row.verification() != null ? row.verification() : AuthenticatedUser.NO_PROFILE;
        return Optional.of(new AuthenticatedUser(row.userId(), row.email(), row.name(), row.role(), row.studentCode(),
                row.title(), row.locale(), row.passwordSet(), verification, Set.copyOf(blockIds), row.sessionId()));
    }

    @Transactional
    public void revoke(long sessionId) {
        sessions.revoke(sessionId, Instant.now(clock));
    }

    @Transactional
    public void revokeAll(long userId) {
        sessions.revokeAllOfUser(userId, Instant.now(clock));
    }

    @Transactional
    public void revokeOthers(long userId, long keepSessionId) {
        sessions.revokeOthers(userId, keepSessionId, Instant.now(clock));
    }

    /** Housekeeping: drop sessions that ended more than 30 days ago. */
    @Scheduled(cron = "0 15 3 * * *", zone = "Asia/Ho_Chi_Minh")
    @Transactional
    public void purgeOldSessions() {
        sessions.deleteExpiredBefore(Instant.now(clock).minus(Duration.ofDays(30)));
    }

    private void touchIfDue(SessionRow row, Instant now) {
        if (row.lastUsedAt().plus(props.touchInterval()).isAfter(now)) {
            return; // avoid a write on every request
        }
        Instant slid = now.plus(ttl(row.remember()));
        Instant cap = row.createdAt().plus(props.sessionAbsoluteMax());
        Instant newExpiry = slid.isBefore(cap) ? slid : cap;
        jdbc.sql("UPDATE auth_session SET last_used_at = :now, expires_at = GREATEST(expires_at, :exp) WHERE id = :id")
                .param("now", Timestamp.from(now))
                .param("exp", Timestamp.from(newExpiry))
                .param("id", row.sessionId())
                .update();
    }

    private Duration ttl(boolean remember) {
        return remember ? props.rememberTtl() : props.sessionTtl();
    }

    private record SessionRow(long sessionId, long userId, boolean remember, Instant createdAt, Instant lastUsedAt,
            String email, String name, Role role, String title, String locale, boolean passwordSet, String studentCode,
            String verification) {
    }
}
