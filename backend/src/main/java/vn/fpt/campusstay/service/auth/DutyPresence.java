package vn.fpt.campusstay.service.auth;

import vn.fpt.campusstay.common.job.ScheduledJobs;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.setting.Parameters;

/**
 * A Staff member's or Manager's duty follows their presence: signing in (or using the app again) puts them on duty;
 * signing out, or no live session used within {@code workload.duty_idle_minutes}, takes them off. Nobody switches it by
 * hand. Routing gives new requests to people on duty first.
 */
@Service
public class DutyPresence {

    private static final Logger log = LoggerFactory.getLogger(DutyPresence.class);

    private final JdbcClient jdbc;
    private final Clock clock;
    private final Parameters parameters;

    private final ScheduledJobs jobs;

    DutyPresence(ScheduledJobs jobs, JdbcClient jdbc, Clock clock, Parameters parameters) {
        this.jobs = jobs;
        this.jdbc = jdbc;
        this.clock = clock;
        this.parameters = parameters;
    }

    /** The person signed in or used the app: on duty if they are Staff or a Manager. */
    @Transactional
    public void active(long userId) {
        jdbc.sql("""
                INSERT INTO auth_staff_profile (user_id, on_duty)
                SELECT u.id, TRUE FROM auth_user u WHERE u.id = :id AND u.role IN ('STAFF', 'MANAGER')
                ON CONFLICT (user_id) DO UPDATE SET on_duty = TRUE WHERE auth_staff_profile.on_duty = FALSE
                """).param("id", userId).update();
    }

    /** The person signed out of one session (or all): off duty unless another session is still live and recent. */
    @Transactional
    public void signedOut(long userId) {
        jdbc.sql("UPDATE auth_staff_profile p SET on_duty = FALSE WHERE p.user_id = :id AND p.on_duty AND NOT "
                + LIVE_SESSION).param("id", userId).params(window()).update();
    }

    /** Every few minutes: people with no live session used recently go off duty. */
    @Scheduled(fixedDelayString = "${campusstay.auth.duty-interval:5m}",
            initialDelayString = "${campusstay.auth.duty-interval:5m}")
    @Transactional
    public void sweep() {
        jobs.run("auth.duty", () -> {
            int off = jdbc.sql("UPDATE auth_staff_profile p SET on_duty = FALSE WHERE p.on_duty AND NOT " + LIVE_SESSION)
                    .params(window()).update();
            if (off > 0) {
                log.info("{} staff went off duty (signed out or idle)", off);
            }
        });
    }

    private static final String LIVE_SESSION = """
            EXISTS (SELECT 1 FROM auth_session s WHERE s.user_id = p.user_id AND s.revoked_at IS NULL
                    AND s.expires_at > :now AND s.last_used_at > :since)
            """;

    private java.util.Map<String, Object> window() {
        Instant now = Instant.now(clock);
        int idle = Math.max(5, parameters.intValue("workload.duty_idle_minutes"));
        return java.util.Map.of("now", Timestamp.from(now), "since", Timestamp.from(now.minus(Duration.ofMinutes(idle))));
    }
}
