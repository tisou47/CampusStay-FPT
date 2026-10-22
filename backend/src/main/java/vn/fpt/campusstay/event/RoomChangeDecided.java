package vn.fpt.campusstay.event;

/**
 * Staff decided a Room-Change Request (Notifications: "Room change decision").
 *
 * @param decision {@code approved} or {@code rejected}, as the sentence uses it
 */
public record RoomChangeDecided(long requestId, String code, long studentId, String decision, String note) {
}
