package vn.fpt.campusstay.service.notification;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import vn.fpt.campusstay.config.MailProperties;

/**
 * Sends due outbox emails. {@code FOR UPDATE SKIP LOCKED} makes it safe if two
 * instances ever run; failures back off quadratically and stop at maxAttempts.
 */
@Component
class EmailOutboxDispatcher {

    private static final Logger log = LoggerFactory.getLogger(EmailOutboxDispatcher.class);

    private final JdbcClient jdbc;
    private final EmailSender sender;
    private final MailProperties props;
    private final Clock clock;

    EmailOutboxDispatcher(JdbcClient jdbc, EmailSender sender, MailProperties props, Clock clock) {
        this.jdbc = jdbc;
        this.sender = sender;
        this.props = props;
        this.clock = clock;
    }

    private record Pending(long id, String to, String subject, String body, int attempts, boolean demo) {
    }

    @Scheduled(fixedDelayString = "${campusstay.mail.dispatch-interval:30s}")
    @Transactional
    public void dispatch() {
        List<Pending> due = jdbc.sql("""
                SELECT id, to_email, subject, body_html, attempts, demo_recipient FROM ntf_email_outbox
                WHERE status = 'PENDING' AND not_before <= :now
                ORDER BY id LIMIT :limit FOR UPDATE SKIP LOCKED
                """)
                .param("now", Timestamp.from(Instant.now(clock)))
                .param("limit", props.batchSize())
                .query((rs, i) -> new Pending(rs.getLong("id"), rs.getString("to_email"), rs.getString("subject"),
                        rs.getString("body_html"), rs.getInt("attempts"), rs.getBoolean("demo_recipient")))
                .list();
        for (Pending p : due) {
            try {
                sender.send(p.to(), p.subject(), p.body(), p.demo());
                jdbc.sql("UPDATE ntf_email_outbox SET status = 'SENT', sent_at = :now, attempts = attempts + 1 WHERE id = :id")
                        .param("now", Timestamp.from(Instant.now(clock))).param("id", p.id()).update();
            } catch (Exception e) {
                int attempts = p.attempts() + 1;
                boolean giveUp = attempts >= props.maxAttempts();
                Instant retryAt = Instant.now(clock).plus(props.retryBase().multipliedBy((long) attempts * attempts));
                log.warn("Email {} failed (attempt {}): {}", p.id(), attempts, e.getMessage());
                jdbc.sql("""
                        UPDATE ntf_email_outbox SET attempts = :attempts, last_error = :error,
                               status = :status, not_before = :retryAt WHERE id = :id
                        """)
                        .param("attempts", attempts)
                        .param("error", e.getMessage() == null ? e.getClass().getSimpleName()
                                : e.getMessage().substring(0, Math.min(1000, e.getMessage().length())))
                        .param("status", giveUp ? "FAILED" : "PENDING")
                        .param("retryAt", Timestamp.from(retryAt))
                        .param("id", p.id())
                        .update();
            }
        }
    }
}
