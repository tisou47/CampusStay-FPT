package vn.fpt.campusstay.event;

/**
 * The Block Manager decided a late check-in (Notifications: "Late check-in decision").
 *
 * @param decision as the sentence uses it, e.g. {@code approved until 10/01/2027} or {@code rejected}
 */
public record LateCheckInDecided(long requestId, long studentId, String decision) {
}
