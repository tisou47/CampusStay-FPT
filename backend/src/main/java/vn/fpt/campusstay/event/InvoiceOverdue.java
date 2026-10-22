package vn.fpt.campusstay.event;

import java.time.Instant;

/**
 * An Invoice is past its due date (Notifications: "Invoice overdue").
 *
 * @param reminder true when the Block Manager sent a reminder (also by email), false when it just became overdue
 */
public record InvoiceOverdue(long invoiceId, String code, long studentId, String title, long amount, Instant dueAt,
        boolean reminder) {
}
