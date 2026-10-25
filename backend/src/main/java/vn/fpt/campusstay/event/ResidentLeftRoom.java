package vn.fpt.campusstay.event;

/**
 * A checked-in resident left a Room (ASG): checked out at the desk, or moved to a Bed in another Room. The
 * Room's door code must change (spec §6.8); INV opens the rotation task in the same transaction.
 *
 * @param reason {@code CHECK_OUT} or {@code MOVE_OUT}
 */
public record ResidentLeftRoom(long roomId, String reason) {
}
