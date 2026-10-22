package vn.fpt.campusstay.service.assignment;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Assignment public API for moving students between Beds during the stay (Requests:
 * Room-Change Requests and swaps). A move ends the old Allocation and creates
 * a new one on the other Bed in the same transaction; the unique index on the
 * Bed and Term is the race guard ({@code 409 BED_TAKEN}).
 */
public interface Moves {

    /**
     * An Allocation with its Bed.
     *
     * @param bedCode {@code A-305-B}; {@code room} the Room code; {@code bed} the Bed label
     * @param gender  the Block's gender, {@code M} or {@code F}
     */
    record Placement(long allocationId, long termId, long studentId, Long applicationId, String status, long bedId,
            String bedCode, String room, String bed, int floor, long roomId, long buildingId, String block,
            String gender, long roomTypeId, long roomClassId, Instant checkedInAt) {

        public boolean active() {
            return status.equals("ACTIVE");
        }
    }

    /** A free Bed and how many students already live in its Room. */
    record FreeBed(long bedId, String code, String room, String bed, long roomId, int floor, long buildingId,
            String block, int roommates) {
    }

    /** Any Allocations by id (ended ones included, for history); unknown ids are left out. */
    Map<Long, Placement> placements(Collection<Long> allocationIds);

    default Optional<Placement> placement(long allocationId) {
        return Optional.ofNullable(placements(List.of(allocationId)).get(allocationId));
    }

    /** The student's active Allocation in the Term. */
    Optional<Placement> current(long studentId, long termId);

    /** Every Allocation id the student has had (ended ones included), newest first. */
    List<Long> allocationsOf(long studentId);

    /** Free Beds of a Room Type and Room Class in Blocks of the gender (not allocated, not held by Round 2). */
    List<FreeBed> freeBeds(long termId, String gender, long roomTypeId, long roomClassId);

    /**
     * Moves the student to another Bed.
     *
     * @param reason {@code ROOM_CHANGE}
     * @return the new Allocation's id
     */
    long move(long allocationId, long bedId, String reason, long by);

    /** Swaps the Beds of two active Allocations of the Term. @return the two new Allocation ids, A first */
    long[] swap(long aAllocationId, long bAllocationId, long by);
}
