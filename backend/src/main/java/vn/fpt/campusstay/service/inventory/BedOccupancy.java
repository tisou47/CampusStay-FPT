package vn.fpt.campusstay.service.inventory;

import java.time.LocalDate;
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

    /**
     * A student's active Allocation and whether its door code is released (spec §6.8).
     *
     * @param waitingFor why the code is not released yet: {@code PAYMENT} (the Balance), {@code CHECK_IN_START},
     *                   {@code CODE} (Staff must confirm the Room's code), {@code TERMINATED}; null once released
     * @param checkInStart the Term's check-in start, for the student's note
     */
    record Stay(long allocationId, long bedId, boolean codeReleased, String waitingFor, LocalDate checkInStart) {
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

    /** Bed id → student user id of the resident living in it (any Term), for the given Beds. */
    Map<Long, Long> residents(Collection<Long> bedIds);

    /** Students of the given Beds who hold the Room's door code now (released, not terminated past the move-out date). */
    Set<Long> codeHolders(Collection<Long> bedIds);

    /**
     * The state of the given Beds' Allocations in the Term for the room map (spec §11.5): {@code RESIDENT} (door code
     * released or desk check-in, orange; {@code LEAVING} once the next Term's requests window opened and the student has
     * no Bed there: orange outline), {@code PAID} (Balance paid, waiting for the door code), {@code UNPAID} (yellow) or
     * {@code NEXT_TERM} (a continuing resident's Bed in this coming Term, blue).
     * Beds without an Allocation are left out.
     */
    Map<Long, String> bedStates(long termId, Collection<Long> bedIds);

    /** The student's active Allocation now: the one whose code is released, else the earliest Term's. */
    Optional<Stay> currentStay(long studentId);
}
