package vn.fpt.campusstay.event;

/**
 * A new door code was confirmed on a Room's lock (INV): Assignment releases it to the paid residents who were
 * waiting for it (spec §6.8), in the same transaction.
 */
public record DoorCodeActivated(long roomId, String room) {
}
