package vn.fpt.campusstay.service.assignment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The requests windows (spec §5.1), every 15 minutes: M2 creates next-Term Allocations, M3 cancels those still awaiting
 * extension, Managers are alerted before M4, and unpaid next-Term fees past M7 cancel their Allocation. Each step is
 * idempotent and runs in its own transaction.
 */
@Component
class RenewalJobs {

    private static final Logger log = LoggerFactory.getLogger(RenewalJobs.class);

    private final RenewalService renewals;

    RenewalJobs(RenewalService renewals) {
        this.renewals = renewals;
    }

    @Scheduled(fixedDelayString = "${campusstay.asg.renewal-interval:15m}",
            initialDelayString = "${campusstay.asg.renewal-interval:15m}")
    void run() {
        int opened = renewals.openDue();
        if (opened > 0) {
            log.info("{} next-Term Allocations created: a requests window opened", opened);
        }
        int notExtended = renewals.closeDue();
        if (notExtended > 0) {
            log.info("{} next-Term Allocations cancelled: not extended by the request deadline", notExtended);
        }
        int alerted = renewals.escalateDue();
        if (alerted > 0) {
            log.info("Managers alerted about undecided next-Term work in {} windows", alerted);
        }
        int unpaid = renewals.cancelUnpaidFees();
        if (unpaid > 0) {
            log.info("{} next-Term Allocations cancelled: next-Term fee not paid", unpaid);
        }
    }
}
