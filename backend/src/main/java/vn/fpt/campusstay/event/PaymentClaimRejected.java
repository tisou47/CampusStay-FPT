package vn.fpt.campusstay.event;

import java.time.Instant;

/**
 * A Manager rejected a student's "I have transferred" (spec §6.7). Published in the Billing transaction:
 * Applications moves the Deposit window of the Application to {@code dueAt}; when {@code cancelled}, the Invoice
 * is void after too many rejections and what depends on it ends (the Application expires, the Allocation is
 * cancelled). Notifications tells the student.
 *
 * @param type     Invoice type code ({@code DEPOSIT}, {@code BALANCE} …)
 * @param dueAt    the deadline again after the rejection (unchanged for a cancelled Invoice)
 * @param rejected how many claims of the Invoice were rejected so far
 */
public record PaymentClaimRejected(long invoiceId, String invoiceCode, long studentId, Long applicationId,
        Long allocationId, String type, String title, long amount, String reason, Instant dueAt, int rejected,
        boolean cancelled) {
}
