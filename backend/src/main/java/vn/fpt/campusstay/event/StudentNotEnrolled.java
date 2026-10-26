package vn.fpt.campusstay.event;

/**
 * A Manager resolved a reconciliation item as "not enrolled" (spec §6.12, group 1 or 2). Published in the
 * Accounts transaction: Assignment cancels the student's next-Term Allocation of the Term, or terminates the stay
 * of a resident whose Term has started (reason Not enrolled); Applications rejects the student's live Application
 * of the Term.
 */
public record StudentNotEnrolled(long studentId, long termId, String note) {
}
