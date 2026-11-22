package vn.fpt.campusstay.service.assignment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Residence jobs (spec §6.6, §6.8, §6.15): every 5 minutes Allocations whose Balance passed its deadline are
 * forfeited; every 15 minutes door codes are released to paid residents whose check-in start has come, and
 * terminations past their move-out date become overdue, check-in inventories past their deadline close and their
 * students are reminded before it. All idempotent.
 */
@Component
class ResidenceJobs {

    private static final Logger log = LoggerFactory.getLogger(ResidenceJobs.class);

    private final ForfeitService forfeits;
    private final DoorCodeRelease release;
    private final TerminationService terminations;
    private final HandoverJobService handovers;
    private final CheckOutFurnitureService furniture;

    ResidenceJobs(ForfeitService forfeits, DoorCodeRelease release, TerminationService terminations,
            HandoverJobService handovers, CheckOutFurnitureService furniture) {
        this.furniture = furniture;
        this.handovers = handovers;
        this.forfeits = forfeits;
        this.release = release;
        this.terminations = terminations;
    }

    @Scheduled(fixedDelayString = "${campusstay.asg.forfeit-interval:5m}",
            initialDelayString = "${campusstay.asg.forfeit-interval:5m}")
    void forfeit() {
        step("forfeit", () -> {
            int n = forfeits.forfeitDue();
            if (n > 0) {
                log.info("{} Allocations forfeited: Balance not paid by its deadline", n);
            }
        });
    }

    @Scheduled(fixedDelayString = "${campusstay.asg.release-interval:15m}",
            initialDelayString = "${campusstay.asg.release-interval:15m}")
    void release() {
        step("door codes", () -> {
            int released = release.releaseDue();
            if (released > 0) {
                log.info("{} door codes released", released);
            }
        });
        step("check-in inventories", () -> {
            int closed = handovers.closeDue();
            if (closed > 0) {
                log.info("{} check-in inventories closed by their deadline", closed);
            }
        });
        step("inventory reminders", handovers::remind);
        step("furniture claims", furniture::expireClaims);
        step("terminations", () -> {
            int overdue = terminations.markOverdue();
            if (overdue > 0) {
                log.info("{} terminations overdue", overdue);
            }
        });
    }

    /** One failing step is logged and the next steps still run (BE-ASG-08); each step is its own transaction. */
    private static void step(String name, Runnable work) {
        try {
            work.run();
        } catch (RuntimeException e) {
            log.error("Residence job step '{}' failed", name, e);
        }
    }
}
