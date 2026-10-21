package vn.fpt.campusstay.req;

/**
 * A swap moved on (NTF: "Swap decision" to the student concerned).
 *
 * @param decision what happened, as the sentence uses it: {@code accepted}, {@code declined}, {@code approved} …
 */
public record SwapDecided(long swapId, String code, long studentId, String decision) {
}
