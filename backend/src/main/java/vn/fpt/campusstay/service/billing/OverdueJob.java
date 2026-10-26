package vn.fpt.campusstay.service.billing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Hourly: unpaid Invoices past their due date become Overdue, then the Utility debt rules run (warnings and the
 * termination trigger, spec §6.14; architecture §11).
 */
@Component
class OverdueJob {

    private static final Logger log = LoggerFactory.getLogger(OverdueJob.class);

    private final FinanceService finance;
    private final UtilityDebtService debts;

    OverdueJob(FinanceService finance, UtilityDebtService debts) {
        this.finance = finance;
        this.debts = debts;
    }

    @Scheduled(fixedDelayString = "${campusstay.bil.overdue-interval:1h}",
            initialDelayString = "${campusstay.bil.overdue-interval:1h}")
    void run() {
        int overdue = finance.markOverdue();
        if (overdue > 0) {
            log.info("{} Invoices became overdue", overdue);
        }
        int terminated = debts.evaluateAll();
        if (terminated > 0) {
            log.info("{} stays reached the Utility debt termination rule", terminated);
        }
    }
}
