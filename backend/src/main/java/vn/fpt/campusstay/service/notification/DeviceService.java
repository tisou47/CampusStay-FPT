package vn.fpt.campusstay.service.notification;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.Tokens;

/**
 * FCM device tokens of the signed-in user (A-05, A-06). A token is looked up
 * by its hash; a token that moves to another account (sign-in as someone else
 * on the same phone) follows the newest sign-in.
 */
@Service
public class DeviceService {

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final Clock clock;

    public DeviceService(JdbcClient jdbc, CurrentUser currentUser, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    /** @param platform {@code android} (the contract's only client) or {@code web} */
    @Transactional
    public void register(String token, String platform) {
        long me = currentUser.get().userId();
        String value = token == null ? "" : token.trim();
        if (value.isEmpty()) {
            throw FieldErrors.single("token", "The device token is missing.");
        }
        String kind = platform == null ? "ANDROID" : platform.trim().toUpperCase(Locale.ROOT);
        if (!kind.equals("ANDROID") && !kind.equals("WEB")) {
            throw FieldErrors.single("platform", "Use android.");
        }
        Timestamp now = Timestamp.from(Instant.now(clock));
        jdbc.sql("""
                INSERT INTO ntf_device (user_id, token, token_hash, platform, created_at, last_seen_at)
                VALUES (:user, :token, :hash, :platform, :now, :now)
                ON CONFLICT (token_hash) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
                       last_seen_at = EXCLUDED.last_seen_at, disabled_at = NULL
                """)
                .param("user", me).param("token", value).param("hash", Tokens.sha256Hex(value)).param("platform", kind)
                .param("now", now).update();
    }

    /** Removes the token from the signed-in user; an unknown token is ignored. */
    @Transactional
    public void unregister(String token) {
        long me = currentUser.get().userId();
        if (token == null || token.isBlank()) {
            throw FieldErrors.single("token", "The device token is missing.");
        }
        jdbc.sql("DELETE FROM ntf_device WHERE token_hash = :hash AND user_id = :user")
                .param("hash", Tokens.sha256Hex(token.trim())).param("user", me).update();
    }
}
