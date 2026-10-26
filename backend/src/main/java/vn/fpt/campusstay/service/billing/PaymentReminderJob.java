package vn.fpt.campusstay.service.billing;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Hourly: payment reminders before the Balance deadline ({@link PaymentReminders}) and the Managers' summary of the
 * claims waiting for confirmation (spec §10: one per hour, not one per claim).
 */
@Component
class PaymentReminderJob {

    private static final Logger log = LoggerFactory.getLogger(PaymentReminderJob.class);

    private final PaymentReminders reminders;
    private final PaymentClaimService claims;
    private final Duration interval;
    private final Clock clock;

    PaymentReminderJob(PaymentReminders reminders, PaymentClaimService claims,
            @Value("${campusstay.bil.reminder-interval:1h}") Duration interval, Clock clock) {
        this.reminders = reminders;
        this.claims = claims;
        this.interval = interval;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${campusstay.bil.reminder-interval:1h}",
            initialDelayString = "${campusstay.bil.reminder-interval:1h}")
    void run() {
        int sent = reminders.sendDue();
        if (sent > 0) {
            log.info("{} payment reminders sent", sent);
        }
        claims.summarize(Instant.now(clock).minus(interval));
    }
}
