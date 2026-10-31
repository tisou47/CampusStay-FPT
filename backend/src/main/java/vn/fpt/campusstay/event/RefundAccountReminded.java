package vn.fpt.campusstay.event;

/** A Manager reminded a student to enter the bank account their refund waits for (R-19). */
public record RefundAccountReminded(long refundId, long studentId, long amount, String reason) {
}
