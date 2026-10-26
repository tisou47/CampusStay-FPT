package vn.fpt.campusstay.event;

/**
 * Staff or a Manager moved a resident to another Bed during the Term for an operational reason (spec §6.13).
 * Nothing is charged; Notifications tells the student.
 *
 * @param reason the reason's label ({@code Room unusable})
 */
public record ResidentMoved(long studentId, String room, String bed, String reason) {
}
