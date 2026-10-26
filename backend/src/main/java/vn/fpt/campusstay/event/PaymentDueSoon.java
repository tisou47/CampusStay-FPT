package vn.fpt.campusstay.event;

import java.time.Instant;

/**
 * A Balance or a next-Term room fee is due in a few days and is not paid or claimed yet (reminders 3 and 1 days
 * before, spec §5.1 M7, §6.6).
 *
 * @param type {@code BALANCE} or {@code TERM_FEE}
 */
public record PaymentDueSoon(long invoiceId, String invoiceCode, long studentId, String title, long amount,
        Instant dueAt, String type) {
}
