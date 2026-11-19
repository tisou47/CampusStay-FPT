package vn.fpt.campusstay.event;

/**
 * Staff completed a resident's check-out and settled the deposit, utilities, and damages.
 * {@code refund} is positive when a refund is queued for the Block Manager's approval.
 */
public record CheckOutCompleted(long studentId, String room, long refund, boolean refundPending) {
}
