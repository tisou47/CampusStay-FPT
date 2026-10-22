package vn.fpt.campusstay.service.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Every few minutes: unpaid Applications past their Deposit window, unanswered roommate invitations and
 * unanswered Round-2 offers expire.
 */
@Component
class ApplicationExpiryJob {

    private static final Logger log = LoggerFactory.getLogger(ApplicationExpiryJob.class);

    private final ApplicationService applications;
    private final Round2Service round2;

    ApplicationExpiryJob(ApplicationService applications, Round2Service round2) {
        this.applications = applications;
        this.round2 = round2;
    }

    @Scheduled(fixedDelayString = "${campusstay.app.expiry-interval:5m}",
            initialDelayString = "${campusstay.app.expiry-interval:5m}")
    void run() {
        int expired = applications.expireOverdue();
        if (expired > 0) {
            log.info("{} Applications expired (Deposit window passed)", expired);
        }
        int offers = round2.expire();
        if (offers > 0) {
            log.info("{} Round-2 offers expired", offers);
        }
    }
}
