package vn.fpt.campusstay.cfg;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Contract item of {@code GET /terms}. Also the CFG public view of a Term for
 * other modules (APP checks the registration window with it).
 *
 * @param current          the Term the apps should show by default: the published Term whose stay
 *                         includes today, otherwise the next one to start
 * @param registrationOpen published and now inside the registration window
 */
public record TermSummary(
        long id,
        String name,
        boolean current,
        boolean registrationOpen,
        LocalDate stayStart,
        LocalDate stayEnd,
        Instant registrationOpensAt,
        Instant registrationClosesAt,
        Instant resultsPublishedAt,
        Instant balanceDueAt,
        LocalDate checkInStart,
        LocalDate checkInEnd,
        int depositWindowHours) {
}
