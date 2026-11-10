package vn.fpt.campusstay.service.billing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Hourly: opens this month's meter periods and reminds Staff of months not closed ({@link MeterReminders}). */
@Component
class MeterReminderJob {

    private static final Logger log = LoggerFactory.getLogger(MeterReminderJob.class);

    private final MeterReminders reminders;

    MeterReminderJob(MeterReminders reminders) {
        this.reminders = reminders;
    }

    @Scheduled(fixedDelayString = "${campusstay.bil.meter-interval:1h}",
            initialDelayString = "${campusstay.bil.meter-interval:1h}")
    void run() {
        int late = reminders.run();
        if (late > 0) {
            log.info("{} meter periods not closed: Staff reminded", late);
        }
    }
}
