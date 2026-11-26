package vn.fpt.campusstay.service.notification;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.common.i18n.Messages;
import vn.fpt.campusstay.service.auth.UserDirectory;

/**
 * Writes in-app notifications from the Admin's templates ({@code ntf_template}), in English and
 * Vietnamese (ADR-25): both texts are kept, and the Notification Center shows the reader's language.
 * Runs in the listener's own transaction, after the change it announces committed (BE-2ND-08).
 * When the template says so, the text in the user's language is pushed to their Android devices after
 * the transaction commits.
 */
@Component
class InAppNotifier {

    /** Values that are words of the system, not text people typed, and so have a Vietnamese form. */
    private static final Set<String> SYSTEM_WORDS = Set.of("decision", "status", "kind", "note", "why", "reason");

    record Template(String titleEn, String titleVi, String bodyEn, String bodyVi, boolean inApp, boolean push) {
    }

    private final JdbcClient jdbc;
    private final PushDispatcher push;
    private final UserDirectory users;
    private final Messages messages;
    private final Clock clock;

    InAppNotifier(JdbcClient jdbc, PushDispatcher push, UserDirectory users, Messages messages, Clock clock) {
        this.jdbc = jdbc;
        this.push = push;
        this.users = users;
        this.messages = messages;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void notify(long userId, String templateKey, Map<String, String> values, String link) {
        notify(userId, templateKey, template(templateKey), values, link, null);
    }

    /** The Admin's template, read once by a caller that notifies many people. */
    Template template(String templateKey) {
        return jdbc.sql("SELECT title_en, title_vi, body, body_vi, in_app, push FROM ntf_template WHERE key = :key")
                .param("key", templateKey)
                .query((rs, i) -> new Template(rs.getString("title_en"), rs.getString("title_vi"), rs.getString("body"),
                        rs.getString("body_vi"), rs.getBoolean("in_app"), rs.getBoolean("push")))
                .optional()
                .orElseThrow(() -> new IllegalStateException("Missing notification template " + templateKey));
    }

    /** @param locale the user's language when the caller already read it, else null (read when a push needs it) */
    @Transactional(propagation = Propagation.MANDATORY)
    void notify(long userId, String templateKey, Template template, Map<String, String> values, String link,
            String locale) {
        Map<String, String> vi = vietnamese(values);
        // Cut to the columns: a long note in a long template must not roll back the action that notified (BE-PLT-08).
        String title = cut(Templates.render(template.titleEn(), values, false), 200);
        String body = cut(Templates.render(template.bodyEn(), values, false), 1000);
        String titleVi = cut(Templates.render(template.titleVi(), vi, false), 200);
        String bodyVi = cut(Templates.render(template.bodyVi(), vi, false), 1000);
        if (template.push()) {
            boolean inVietnamese = Locales.VI.equals(locale != null ? locale : users.locale(userId));
            push.afterCommit(userId, inVietnamese ? titleVi : title, inVietnamese ? bodyVi : body, link);
        }
        if (!template.inApp()) {
            return;
        }
        jdbc.sql("""
                INSERT INTO ntf_notification (user_id, event_key, title, body, title_vi, body_vi, link, created_at)
                VALUES (:user, :key, :title, :body, :titleVi, :bodyVi, :link, :now)
                """)
                .param("user", userId)
                .param("key", templateKey)
                .param("title", title)
                .param("body", body)
                .param("titleVi", titleVi)
                .param("bodyVi", bodyVi)
                .param("link", link)
                .param("now", Timestamp.from(Instant.now(clock)))
                .update();
    }

    private static String cut(String text, int max) {
        return text == null || text.length() <= max ? text : text.substring(0, max - 1) + "…";
    }

    private Map<String, String> vietnamese(Map<String, String> values) {
        Map<String, String> out = new HashMap<>(values);
        for (String key : SYSTEM_WORDS) {
            if (out.get(key) != null) {
                out.put(key, messages.translate(out.get(key), Locales.VI));
            }
        }
        return out;
    }
}
