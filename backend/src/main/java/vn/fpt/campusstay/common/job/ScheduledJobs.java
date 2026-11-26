package vn.fpt.campusstay.common.job;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import vn.fpt.campusstay.exception.ApiException;

/**
 * Runs every {@code @Scheduled} job (D1, D2). One server at a time: the job takes the PostgreSQL advisory lock
 * {@code pg_try_advisory_xact_lock(JOB_LOCKS, name.hashCode())} on a connection of its own, held until the job ends,
 * and a server that does not get it skips that run. Each run that ran is recorded in {@code sys_job_run} (in its own
 * transaction, so a job that rolls back is still recorded), with the error's class and code only.
 */
@Component
public class ScheduledJobs {

    /** First key of the jobs' advisory locks; the second is the job name's {@link String#hashCode} (stable by spec). */
    static final int JOB_LOCKS = 0x4A4F4253;
    private static final Duration KEEP = Duration.ofDays(7);
    private static final Logger log = LoggerFactory.getLogger(ScheduledJobs.class);

    public record LastRun(String job, Instant startedAt, Instant finishedAt, Boolean ok, String errorClass,
            String errorCode, long failedLast24h) {
    }

    private final DataSource dataSource;
    private final JdbcClient jdbc;
    private final TransactionTemplate own;
    private final Clock clock;

    public ScheduledJobs(DataSource dataSource, JdbcClient jdbc, PlatformTransactionManager tx, Clock clock) {
        this.dataSource = dataSource;
        this.jdbc = jdbc;
        this.own = new TransactionTemplate(tx);
        this.own.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = clock;
    }

    /**
     * Runs the job unless another server (or thread) runs it now. An error is recorded and thrown again, so the
     * scheduler logs it as before.
     *
     * @return false when the run was skipped
     */
    public boolean run(String job, Runnable work) {
        try (Connection lock = dataSource.getConnection()) {
            lock.setAutoCommit(false);
            try {
                if (!tryLock(lock, job)) {
                    log.debug("Job {} skipped: another server runs it", job);
                    return false;
                }
                long run = start(job);
                try {
                    work.run();
                } catch (RuntimeException | Error e) {
                    finish(run, e);
                    throw e;
                }
                finish(run, null);
                return true;
            } finally {
                lock.rollback(); // ends the transaction, which releases the lock
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Job " + job + " could not take its lock", e);
        }
    }

    /** The last run of every job that ran, by name. */
    public List<LastRun> lastRuns() {
        Timestamp day = Timestamp.from(Instant.now(clock).minus(Duration.ofDays(1)));
        return jdbc.sql("""
                SELECT DISTINCT ON (r.job) r.job, r.started_at, r.finished_at, r.ok, r.error_class, r.error_code,
                       (SELECT count(*) FROM sys_job_run f WHERE f.job = r.job AND f.ok = FALSE AND f.started_at > :day)
                           AS failed
                FROM sys_job_run r ORDER BY r.job, r.started_at DESC
                """).param("day", day)
                .query((rs, i) -> new LastRun(rs.getString("job"), instant(rs, "started_at"), instant(rs, "finished_at"),
                        (Boolean) rs.getObject("ok"), rs.getString("error_class"), rs.getString("error_code"),
                        rs.getLong("failed")))
                .list();
    }

    private static boolean tryLock(Connection c, String job) throws SQLException {
        try (PreparedStatement s = c.prepareStatement("SELECT pg_try_advisory_xact_lock(?, ?)")) {
            s.setInt(1, JOB_LOCKS);
            s.setInt(2, job.hashCode());
            try (ResultSet rs = s.executeQuery()) {
                return rs.next() && rs.getBoolean(1);
            }
        }
    }

    private long start(String job) {
        Instant now = Instant.now(clock);
        return own.execute(s -> {
            jdbc.sql("DELETE FROM sys_job_run WHERE job = :job AND started_at < :old").param("job", job)
                    .param("old", Timestamp.from(now.minus(KEEP))).update();
            return jdbc.sql("INSERT INTO sys_job_run (job, started_at) VALUES (:job, :now) RETURNING id")
                    .param("job", job).param("now", Timestamp.from(now)).query(Long.class).single();
        });
    }

    private void finish(long run, Throwable error) {
        try {
            own.executeWithoutResult(s -> jdbc.sql("""
                    UPDATE sys_job_run SET finished_at = :now, ok = :ok, error_class = :class, error_code = :code
                    WHERE id = :id
                    """).param("now", Timestamp.from(Instant.now(clock))).param("ok", error == null)
                    .param("class", error == null ? null : error.getClass().getName())
                    .param("code", code(error)).param("id", run).update());
        } catch (DataAccessException e) {
            log.warn("Run {} of a job could not be recorded", run, e);
        }
    }

    /** A code that carries no personal data: the API error's code, else nothing (messages may name people). */
    private static String code(Throwable error) {
        return error instanceof ApiException api ? api.code() : null;
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
