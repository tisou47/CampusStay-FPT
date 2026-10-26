package vn.fpt.campusstay.event;

import java.time.Instant;

/**
 * An Allocation was cancelled because its Balance was not paid by the deadline, or because its payment claims were
 * rejected too often (spec §6.6, §6.7): the Bed is free (Round 2 may offer it) and the Deposit is kept by the refund
 * rule "Balance not paid". Applications marks the Application Forfeited; Notifications tells the student.
 *
 * @param reason {@code UNPAID} or {@code CLAIMS_REJECTED}
 * @param refund the Deposit refund by the rule (VND), 0 when none
 */
public record AllocationForfeited(long allocationId, Long applicationId, long studentId, long termId, String room,
        Instant dueAt, long refund, String reason) {
}
