package vn.fpt.campusstay.event;

/** The Block Manager decided a refund (Notifications: "Refund decision"). @param decision {@code approved} or {@code rejected} */
public record RefundDecided(long refundId, long studentId, long amount, String decision) {
}
