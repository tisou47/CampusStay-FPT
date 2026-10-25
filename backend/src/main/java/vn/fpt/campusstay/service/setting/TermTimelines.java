package vn.fpt.campusstay.service.setting;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * The timeline rules of spec §5.2, shared by registration-period requests and the wizard: M1 ≤ M2 < M3 < M4 ≤ M5 ≤
 * M6 < M7 < the stay end of the Term before; registration close ≤ results; M4 ≤ results; Check-in starts on or after
 * the Term before must be left. Renewal milestones need a Term before it and come all together.
 */
final class TermTimelines {

    /** The published Term just before (by stay start), whose continuing residents the renewal milestones serve. */
    record Previous(String name, LocalDate stayEnd, LocalDate checkOutBy) {
    }

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private TermTimelines() {
    }

    /**
     * @param complete whether every registration milestone must be filled in (a Term about to be published, a
     *                 wizard step that saves the timeline); a request may leave the later ones empty
     */
    static void check(TermPlan.Timeline t, LocalDate stayStart, LocalDate stayEnd, Previous previous, boolean complete,
            FieldErrors errors) {
        errors.check(t.registrationOpensAt() != null, "registrationOpensAt", "Enter when registration opens.");
        errors.check(t.registrationClosesAt() != null, "registrationClosesAt", "Enter when registration closes.");
        if (complete) {
            errors.check(t.resultsPublishedAt() != null, "resultsPublishedAt", "Enter when assignment results come out.");
            errors.check(t.roommateHours() != null, "roommateHours", "Enter the roommate confirmation window in hours.");
            errors.check(t.depositHours() != null, "depositHours", "Enter the Deposit payment window in hours.");
            errors.check(t.balanceDueAt() != null, "balanceDueAt", "Enter when the Balance is due.");
            errors.check(t.checkInStart() != null, "checkInStart", "Enter the first Check-in day.");
            errors.check(t.checkInEnd() != null, "checkInEnd", "Enter the last Check-in day.");
            errors.check(t.checkOutBy() != null, "checkOutBy", "Enter the Check-out deadline.");
        }
        errors.check(t.roommateHours() == null || t.roommateHours() > 0, "roommateHours", "Enter a number of hours above 0.");
        errors.check(t.depositHours() == null || t.depositHours() > 0 && t.depositHours() <= 720, "depositHours",
                "Enter 1 to 720 hours.");
        if (before(t.registrationClosesAt(), t.registrationOpensAt(), true)) {
            errors.add("registrationClosesAt", "Registration must close after it opens.");
        }
        if (before(t.resultsPublishedAt(), t.registrationClosesAt(), false)) {
            errors.add("resultsPublishedAt", "Results come out after registration closes.");
        }
        if (t.checkInStart() != null && t.checkInEnd() != null && t.checkInEnd().isBefore(t.checkInStart())) {
            errors.add("checkInEnd", "Check-in must end on or after its first day.");
        }
        if (t.checkInEnd() != null && stayEnd != null && t.checkInEnd().isAfter(stayEnd)) {
            errors.add("checkInEnd", "Check-in must end before the stay ends.");
        }
        if (t.checkOutBy() != null && stayStart != null && t.checkOutBy().isBefore(stayStart)) {
            errors.add("checkOutBy", "Check-out must be after the stay starts.");
        }
        if (previous != null && t.checkInStart() != null && t.checkInStart().isBefore(previous.checkOutBy())) {
            errors.add("checkInStart", "Check-in starts on or after " + DAY.format(previous.checkOutBy())
                    + ", the day the residents of " + previous.name() + " must have checked out.");
        }
        if (!t.hasRenewal()) {
            return;
        }
        if (previous == null) {
            errors.add("requestsOpenAt", "No Term runs before this one, so leave the renewal milestones empty.");
            return;
        }
        boolean all = t.publishAt() != null && t.requestsOpenAt() != null && t.requestsCloseAt() != null
                && t.decisionsDueAt() != null && t.reconciliationDueAt() != null && t.feesIssueAt() != null
                && t.feesDueAt() != null;
        if (!all) {
            String message = "Fill in every renewal milestone, or leave them all empty.";
            errors.check(t.publishAt() != null, "publishAt", message);
            errors.check(t.requestsOpenAt() != null, "requestsOpenAt", message);
            errors.check(t.requestsCloseAt() != null, "requestsCloseAt", message);
            errors.check(t.decisionsDueAt() != null, "decisionsDueAt", message);
            errors.check(t.reconciliationDueAt() != null, "reconciliationDueAt", message);
            errors.check(t.feesIssueAt() != null, "feesIssueAt", message);
            errors.check(t.feesDueAt() != null, "feesDueAt", message);
            return;
        }
        if (t.requestsOpenAt().isBefore(t.publishAt())) {
            errors.add("requestsOpenAt", "The requests window opens on or after the Term is published.");
        }
        if (!t.requestsCloseAt().isAfter(t.requestsOpenAt())) {
            errors.add("requestsCloseAt", "The requests window must close after it opens.");
        }
        if (!t.decisionsDueAt().isAfter(t.requestsCloseAt())) {
            errors.add("decisionsDueAt", "Decisions are due after the requests window closes.");
        }
        if (t.reconciliationDueAt().isBefore(t.decisionsDueAt())) {
            errors.add("reconciliationDueAt", "The reconciliation is due on or after the decision deadline.");
        }
        if (t.feesIssueAt().isBefore(t.reconciliationDueAt())) {
            errors.add("feesIssueAt", "Next-Term fees are issued on or after the reconciliation.");
        }
        if (!t.feesDueAt().isAfter(t.feesIssueAt())) {
            errors.add("feesDueAt", "The next-Term fee deadline comes after the fees are issued.");
        }
        Instant previousEnd = previous.stayEnd().plusDays(1).atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant();
        if (!t.feesDueAt().isBefore(previousEnd)) {
            errors.add("feesDueAt", "The next-Term fees are due before " + previous.name() + " ends ("
                    + DAY.format(previous.stayEnd()) + ").");
        }
        if (t.resultsPublishedAt() != null && t.resultsPublishedAt().isBefore(t.decisionsDueAt())) {
            errors.add("resultsPublishedAt", "Assignment results come out on or after the decision deadline.");
        }
    }

    /** {@code a} before {@code b} (or equal, when {@code strict}); false while either is missing. */
    private static boolean before(Instant a, Instant b, boolean strict) {
        if (a == null || b == null) {
            return false;
        }
        return strict ? !a.isAfter(b) : a.isBefore(b);
    }
}
