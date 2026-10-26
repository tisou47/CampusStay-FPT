package vn.fpt.campusstay.event;

/**
 * The Utility debt of a resident reached the termination rule after the final warning (spec §6.14): Assignment
 * starts the termination in the same transaction.
 */
public record UtilityTerminationDue(long allocationId, long studentId, long termId, long debt, int overdueCount) {
}
