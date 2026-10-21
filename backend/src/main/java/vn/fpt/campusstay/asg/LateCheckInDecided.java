package vn.fpt.campusstay.asg;

/**
 * The Block Manager decided a late check-in (NTF: "Late check-in decision").
 *
 * @param decision as the sentence uses it, e.g. {@code approved until 10/01/2027} or {@code rejected}
 */
public record LateCheckInDecided(long requestId, long studentId, String decision) {
}
