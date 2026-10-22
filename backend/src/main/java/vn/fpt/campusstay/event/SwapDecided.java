package vn.fpt.campusstay.event;

/**
 * A swap moved on (Notifications: "Swap decision" to the student concerned).
 *
 * @param decision what happened, as the sentence uses it: {@code accepted}, {@code declined}, {@code approved} …
 */
public record SwapDecided(long swapId, String code, long studentId, String decision) {
}
