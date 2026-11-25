package vn.fpt.campusstay.service.request;

import vn.fpt.campusstay.common.job.ScheduledJobs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Every few minutes: requests past their Block's timers escalate, and escalations of closed requests close. */
@Component
class EscalationJob {

    private static final Logger log = LoggerFactory.getLogger(EscalationJob.class);

    private final EscalationService escalations;

    private final ScheduledJobs jobs;

    EscalationJob(ScheduledJobs jobs, EscalationService escalations) {
        this.jobs = jobs;
        this.escalations = escalations;
    }

    @Scheduled(fixedDelayString = "${campusstay.req.sla-interval:15m}",
            initialDelayString = "${campusstay.req.sla-interval:15m}")
    void run() {
        jobs.run("req.escalation", () -> {
            int opened = escalations.scan();
            if (opened > 0) {
                log.info("{} requests escalated", opened);
            }
        });
    }
}
