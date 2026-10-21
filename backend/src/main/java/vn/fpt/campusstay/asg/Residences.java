package vn.fpt.campusstay.asg;

import java.util.Collection;
import java.util.List;
import java.util.Map;
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

    /**
     * A student with an active Allocation in the Term.
     *
     * @param checkedIn whether the student has checked in
     */
    record TermResident(long studentId, long buildingId, boolean checkedIn) {
    }

    /** Students with an active Allocation in the Term (NTF email groups). */
    List<TermResident> ofTerm(long termId);

    /** Bed id → student checked in to it now (an active Allocation of any Term), for the given Beds. */
    Map<Long, Long> checkedIn(Collection<Long> bedIds);
}
