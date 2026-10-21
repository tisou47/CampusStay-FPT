package vn.fpt.campusstay.req.internal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Every few minutes: requests past their Block's timers escalate, and escalations of closed requests close. */
@Component
class EscalationJob {

    private static final Logger log = LoggerFactory.getLogger(EscalationJob.class);

    private final EscalationService escalations;

    EscalationJob(EscalationService escalations) {
        this.escalations = escalations;
    }

    @Scheduled(fixedDelayString = "${campusstay.req.sla-interval:15m}",
            initialDelayString = "${campusstay.req.sla-interval:15m}")
    void run() {
        int opened = escalations.scan();
        if (opened > 0) {
            log.info("{} requests escalated", opened);
        }
    }
}
