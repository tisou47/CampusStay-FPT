package vn.fpt.campusstay.event;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Utility debt (spec §6.14, D-27): warning 1 when a Utility Invoice becomes overdue ({@code FIRST}), the final
 * warning ({@code FINAL}) with the earliest termination day when a new Utility Invoice is issued while one is
 * overdue, or when the debt reaches the Utility Deposit held.
 *
 * @param months the overdue months that end a stay (Admin › Refunds, penalties and terminations)
 */
public record UtilityWarningIssued(String level, long studentId, long allocationId, String invoiceCode,
        String title, long amount, long debt, int months, LocalDate terminateOn, Instant issuedAt) {
}
