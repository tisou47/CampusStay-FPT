package vn.fpt.campusstay.ntf.internal;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes in-app notifications from the Admin's templates ({@code ntf_template},
 * English title and body). Runs in the caller's transaction, so a notification
 * exists exactly when the change it announces does. Push to Android comes in S4.
 */
@Component
class InAppNotifier {

    private record Template(String title, String body, boolean inApp) {
    }

    private final JdbcClient jdbc;
    private final Clock clock;

    InAppNotifier(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void notify(long userId, String templateKey, Map<String, String> values, String link) {
        Template template = jdbc.sql("SELECT title_en, body, in_app FROM ntf_template WHERE key = :key")
                .param("key", templateKey)
                .query((rs, i) -> new Template(rs.getString("title_en"), rs.getString("body"), rs.getBoolean("in_app")))
                .optional()
                .orElseThrow(() -> new IllegalStateException("Missing notification template " + templateKey));
        if (!template.inApp()) {
            return;
        }
        jdbc.sql("""
                INSERT INTO ntf_notification (user_id, event_key, title, body, link, created_at)
                VALUES (:user, :key, :title, :body, :link, :now)
                """)
                .param("user", userId)
                .param("key", templateKey)
                .param("title", Templates.render(template.title(), values, false))
                .param("body", Templates.render(template.body(), values, false))
                .param("link", link)
                .param("now", Timestamp.from(Instant.now(clock)))
                .update();
    }
}
