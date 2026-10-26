package vn.fpt.campusstay.event;

import java.time.Instant;

/** A Balance is due in a few days and is not paid or claimed yet (reminders 3 and 1 days before, spec §6.6). */
public record PaymentDueSoon(long invoiceId, String invoiceCode, long studentId, String title, long amount,
        Instant dueAt) {
}
