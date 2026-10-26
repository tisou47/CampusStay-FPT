package vn.fpt.campusstay.event;

import java.time.LocalDate;

/**
 * A next-Term Allocation was cancelled (spec §5.1, §6.10, §6.12): the student ended the stay, did not extend it by
 * M3, did not pay the next-Term fee by M7, is not enrolled, or was terminated. The Bed is free for the next Term
 * (Round 2 may offer it). Requests closes the student's open next-Term requests in the same transaction;
 * Notifications tells the student (in-app, push and email) unless they asked for it themselves.
 *
 * @param reason     {@code END_OF_STAY}, {@code NOT_EXTENDED}, {@code FEE_NOT_PAID}, {@code NOT_ENROLLED},
 *                   {@code TERMINATED}
 * @param checkOutBy the day the student must have checked out of the current Term
 */
public record NextTermAllocationCancelled(long allocationId, long studentId, long termId, String termName,
        String room, String reason, LocalDate checkOutBy) {
}
