package vn.fpt.campusstay.event;

/**
 * Assignment moved an Allocation to another Bed (an operational move, a room change or a swap): the old Allocation
 * ended and {@code toAllocationId} carries the stay on. Requests closes what was filed from the old one in the same
 * transaction.
 */
public record AllocationMoved(long fromAllocationId, long toAllocationId) {
}
