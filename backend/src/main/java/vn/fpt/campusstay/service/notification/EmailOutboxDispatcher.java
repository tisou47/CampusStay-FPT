package vn.fpt.campusstay.service.notification;

import vn.fpt.campusstay.common.job.ScheduledJobs;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import vn.fpt.campusstay.config.MailProperties;

/**
 * Sends due outbox emails. A short transaction claims a batch ({@code FOR UPDATE SKIP LOCKED}, then a lease that
 * pushes {@code not_before} on), the SMTP calls run outside any transaction (BE-PLT-05), and each email is then
 * marked on its own. A crash mid-batch only delays those emails by the lease. Failures back off quadratically and
 * stop at maxAttempts.
 */
@Component
class EmailOutboxDispatcher {

    private static final Logger log = LoggerFactory.getLogger(EmailOutboxDispatcher.class);

    private final JdbcClient jdbc;
    private final EmailSender sender;
    private final MailProperties props;
    private final TransactionTemplate tx;
    private final Clock clock;

    /** How long a claimed email waits before another run may take it again. */
    private static final Duration LEASE = Duration.ofMinutes(10);

    private final ScheduledJobs jobs;

    EmailOutboxDispatcher(ScheduledJobs jobs, JdbcClient jdbc, EmailSender sender, MailProperties props, PlatformTransactionManager tm,
            Clock clock) {
        this.jobs = jobs;
        this.tx = new TransactionTemplate(tm);
        this.jdbc = jdbc;
        this.sender = sender;
        this.props = props;
        this.clock = clock;
    }

    private record Pending(long id, String to, String subject, String body, int attempts, boolean demo) {
    }

    @Scheduled(fixedDelayString = "${campusstay.mail.dispatch-interval:30s}")
    public void dispatch() {
        jobs.run("ntf.email-outbox", this::dispatchOnce);
    }

    /** One pass without the job lock (tests call it directly, so a scheduled run holding the lock cannot skip it). */
    void dispatchOnce() {
        List<Pending> due = tx.execute(s -> claim());
        for (Pending p : due) {
            send(p);
        }
    }

    private List<Pending> claim() {
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
        if (!due.isEmpty()) {
            jdbc.sql("UPDATE ntf_email_outbox SET not_before = :lease WHERE id IN (:ids)")
                    .param("lease", Timestamp.from(Instant.now(clock).plus(LEASE)))
                    .param("ids", due.stream().map(Pending::id).toList()).update();
        }
        return due;
    }

    private void send(Pending p) {
        try {
            sender.send(p.to(), p.subject(), p.body(), p.demo());
            jdbc.sql("UPDATE ntf_email_outbox SET status = 'SENT', sent_at = :now, attempts = attempts + 1 WHERE id = :id")
                    .param("now", Timestamp.from(Instant.now(clock))).param("id", p.id()).update();
        } catch (Exception e) {
            int attempts = p.attempts() + 1;
            boolean giveUp = attempts >= props.maxAttempts();
            Instant retryAt = Instant.now(clock).plus(props.retryBase().multipliedBy((long) attempts * attempts));
            // SMTP replies quote the address: only the exception class in the log, the text stays in last_error (BE-PLT-19).
            log.warn("Email {} failed (attempt {}): {}", p.id(), attempts, e.getClass().getSimpleName());
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
