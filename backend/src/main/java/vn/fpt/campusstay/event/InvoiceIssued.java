package vn.fpt.campusstay.event;

import java.time.Instant;

/** A charge Invoice was issued to a student (Notifications: "New Invoice"). */
public record InvoiceIssued(long invoiceId, String code, long studentId, String title, long amount, Instant dueAt) {
}
