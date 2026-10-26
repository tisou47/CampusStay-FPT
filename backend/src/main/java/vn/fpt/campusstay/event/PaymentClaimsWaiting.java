package vn.fpt.campusstay.event;

/**
 * Hourly summary for the Managers (spec §10: one summary per hour, not one per claim): new claims arrived in the
 * last hour and {@code count} claims ({@code total} VND) wait for confirmation.
 */
public record PaymentClaimsWaiting(long count, long total) {
}
