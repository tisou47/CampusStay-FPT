package vn.fpt.campusstay.service.inventory;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Port implemented by Assignment, which owns Allocations: Inventory shows who sleeps in a
 * Bed and refuses changes to Rooms that are in use, without reading Assignment tables
 * (Assignment depends on Inventory for Beds).
 */
public interface BedOccupancy {

    /** A student's active Allocation in a Term; {@code checkedIn}: the student lives there (desk Check-in done). */
    record Stay(long allocationId, long bedId, boolean checkedIn) {
    }

    /** Bed id → student user id of the active Allocation in the Term, for the given Beds. */
    Map<Long, Long> occupants(long termId, Collection<Long> bedIds);

    /** The given Beds that an active Allocation holds, in any Term. */
    Set<Long> bedsInUse(Collection<Long> bedIds);

    /** Every Bed that an active Allocation holds, in any Term. */
    Set<Long> bedsInUse();

    /**
     * The given Beds already promised to someone in one of the Terms: held by an active Allocation, proposed by a
     * live assignment run, or held by a Round-2 option. Their price is fixed, so their Room's class must not change.
     */
    Set<Long> bedsPromised(Collection<Long> termIds, Collection<Long> bedIds);

    /** Bed id → student user id of the checked-in resident (any Term), for the given Beds. */
    Map<Long, Long> residents(Collection<Long> bedIds);

    /** The student's active Allocation in the Term. */
    Optional<Stay> stayOf(long studentId, long termId);
}
