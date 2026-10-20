package vn.fpt.campusstay.cfg;

/**
 * Published inside the CFG transaction when the Admin changes the number of
 * Beds of a Room Type that has no active Allocation; INV adds or retires Beds of
 * its Rooms in the same transaction.
 */
public record RoomTypeBedsChanged(long roomTypeId, int previousBeds, int beds) {
}
