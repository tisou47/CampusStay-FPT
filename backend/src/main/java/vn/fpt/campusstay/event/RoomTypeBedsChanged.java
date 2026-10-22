package vn.fpt.campusstay.event;

/**
 * Published inside the Settings transaction when the Admin changes the number of
 * Beds of a Room Type that has no active Allocation; Inventory adds or retires Beds of
 * its Rooms in the same transaction.
 */
public record RoomTypeBedsChanged(long roomTypeId, int previousBeds, int beds) {
}
