package vn.fpt.campusstay.app.internal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Every few minutes: unpaid Applications past their Deposit window and unanswered roommate invitations expire. */
@Component
class ApplicationExpiryJob {

    private static final Logger log = LoggerFactory.getLogger(ApplicationExpiryJob.class);

    private final ApplicationService applications;

    ApplicationExpiryJob(ApplicationService applications) {
        this.applications = applications;
    }

    @Scheduled(fixedDelayString = "${campusstay.app.expiry-interval:5m}",
            initialDelayString = "${campusstay.app.expiry-interval:5m}")
    void run() {
        int expired = applications.expireOverdue();
        if (expired > 0) {
            log.info("{} Applications expired (Deposit window passed)", expired);
        }
    }
}
