package vn.fpt.campusstay.req;

/**
 * Staff decided a Room-Change Request (NTF: "Room change decision").
 *
 * @param decision {@code approved} or {@code rejected}, as the sentence uses it
 */
public record RoomChangeDecided(long requestId, String code, long studentId, String decision, String note) {
}
