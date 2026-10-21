package vn.fpt.campusstay.req.internal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Every few minutes: unanswered swap invitations expire and old swap-board posts come down. */
@Component
class SwapExpiryJob {

    private static final Logger log = LoggerFactory.getLogger(SwapExpiryJob.class);

    private final SwapService swaps;

    SwapExpiryJob(SwapService swaps) {
        this.swaps = swaps;
    }

    @Scheduled(fixedDelayString = "${campusstay.req.expiry-interval:5m}",
            initialDelayString = "${campusstay.req.expiry-interval:5m}")
    void run() {
        int expired = swaps.expire();
        if (expired > 0) {
            log.info("{} swap invitations expired", expired);
        }
    }
}
