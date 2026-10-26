package vn.fpt.campusstay.event;

import java.time.Instant;

/**
 * Published in the Billing transaction that marks an Invoice Paid (a Manager confirmed the student's claim).
 * Applications moves the Application on and Assignment releases the door code in the same transaction;
 * Notifications writes the in-app notification.
 *
 * @param type          {@code DEPOSIT}, {@code BALANCE}, {@code UTILITY}, {@code ROOM_CHANGE} or {@code DAMAGE}
 * @param applicationId the Application a Deposit or Balance belongs to, else null
 * @param allocationId  the Allocation a Balance, Utility or charge Invoice belongs to, else null
 * @param paidAt        when the student claimed the transfer ("earlier Deposit first" uses it, spec §6.7)
 */
public record PaymentConfirmed(long invoiceId, String invoiceCode, long studentId, Long applicationId,
        Long allocationId, String type, String title, long amount, Instant paidAt) {
}
