package vn.fpt.campusstay.service.setting;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.springframework.stereotype.Service;

import vn.fpt.campusstay.common.ServerErrors;
import vn.fpt.campusstay.common.file.FileStore;
import vn.fpt.campusstay.common.job.ScheduledJobs;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.notification.EmailBacklog;

/** Admin › System health (D2): the scheduled jobs, recent server errors, uploads and the email outbox. */
@Service
public class SystemHealthService {

    public record Job(String job, Instant lastStartedAt, Instant lastFinishedAt, Boolean ok, boolean running,
            String errorClass, String errorCode, long failedLast24h) {
    }

    public record Health(Instant checkedAt, List<Job> jobs, int serverErrorsLastHour, FileStore.Usage uploads,
            EmailBacklog.Backlog emailOutbox) {
    }

    private final ScheduledJobs jobs;
    private final ServerErrors errors;
    private final FileStore files;
    private final EmailBacklog email;
    private final CurrentUser currentUser;
    private final Clock clock;

    public SystemHealthService(ScheduledJobs jobs, ServerErrors errors, FileStore files, EmailBacklog email,
            CurrentUser currentUser, Clock clock) {
        this.jobs = jobs;
        this.errors = errors;
        this.files = files;
        this.email = email;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    public Health health() {
        currentUser.require(Role.ADMIN);
        List<Job> runs = jobs.lastRuns().stream().map(r -> new Job(r.job(), r.startedAt(), r.finishedAt(), r.ok(),
                r.finishedAt() == null, r.errorClass(), r.errorCode(), r.failedLast24h())).toList();
        return new Health(Instant.now(clock), runs, errors.lastHour(), files.usage(), email.backlog());
    }
}
