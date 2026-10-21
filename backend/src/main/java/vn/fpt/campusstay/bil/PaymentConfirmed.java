package vn.fpt.campusstay.bil;

import java.time.Instant;

/**
 * Published in the BIL transaction that marks an Invoice Paid (bank feed or
 * manual confirmation). APP moves the Application on in the same transaction;
 * NTF writes the in-app notification.
 *
 * @param type          {@code DEPOSIT}, {@code BALANCE}, {@code UTILITY}, {@code ROOM_CHANGE} or {@code DAMAGE}
 * @param applicationId the Application a Deposit or Balance belongs to, else null
 */
public record PaymentConfirmed(long invoiceId, String invoiceCode, long studentId, Long applicationId, String type,
        String title, long amount, Instant paidAt) {
}
