package vn.fpt.campusstay.cfg;

import java.time.Instant;
import java.time.LocalDate;

/**
 * CFG public view of a published Term for other modules (APP checks the
 * registration window with it). {@code GET /terms} maps it to its contract
 * item, which carries the id as a string (ADR-15).
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
