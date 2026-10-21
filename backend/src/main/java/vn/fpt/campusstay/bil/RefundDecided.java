package vn.fpt.campusstay.bil;

/** The Block Manager decided a refund (NTF: "Refund decision"). @param decision {@code approved} or {@code rejected} */
public record RefundDecided(long refundId, long studentId, long amount, String decision) {
}
