package vn.fpt.campusstay.service.inventory;

import java.util.Collection;
import java.util.Map;
import java.util.Set;

/**
 * Port implemented by Assignment, which owns Allocations: Inventory shows who sleeps in a
 * Bed and refuses changes to Rooms that are in use, without reading Assignment tables
 * (Assignment depends on Inventory for Beds).
 */
public interface BedOccupancy {

    /** Bed id → student user id of the active Allocation in the Term, for the given Beds. */
    Map<Long, Long> occupants(long termId, Collection<Long> bedIds);

    /** The given Beds that an active Allocation holds, in any Term. */
    Set<Long> bedsInUse(Collection<Long> bedIds);

    /** Every Bed that an active Allocation holds, in any Term. */
    Set<Long> bedsInUse();
}
