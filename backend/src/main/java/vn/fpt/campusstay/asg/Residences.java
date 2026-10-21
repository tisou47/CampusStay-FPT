package vn.fpt.campusstay.asg;

import java.util.Optional;

/** ASG public API: where a student lives now, and who lives in a Room (MNT reports and Room summaries). */
public interface Residences {

    /**
     * The Bed a student holds through an active Allocation.
     *
     * @param room the Room code ({@code A-301}); {@code bed} the Bed label ({@code A})
     */
    record Residence(long allocationId, long termId, long studentId, long roomId, String room, long bedId,
            String bed, long buildingId, String block, boolean checkedIn) {
    }

    /** The student's active Allocation, the latest one when there are several Terms. */
    Optional<Residence> current(long studentId);

    /** Students checked in to the Room in the Term. */
    int residents(long roomId, long termId);
}
