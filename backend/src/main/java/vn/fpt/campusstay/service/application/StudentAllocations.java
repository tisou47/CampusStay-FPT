package vn.fpt.campusstay.service.application;

import java.time.Instant;
import java.util.Optional;

/**
 * Port implemented by Assignment, which owns Allocations: where an Application's
 * student was placed, for the student's Application and Home screens. Applications must
 * not read Assignment tables and Assignment already depends on Applications.
 */
public interface StudentAllocations {

    /** @param residentAt when the student became a resident (door code released or desk check-in), else null */
    record Placement(long allocationId, String room, String bed, String block, int floor, Instant allocatedAt,
            Instant residentAt) {
    }

    Optional<Placement> ofApplication(long applicationId);

    /** The student already holds a Bed for the Term (a continuing resident uses requests, not an Application). */
    boolean holdsBed(long studentId, long termId);

    /** Students who hold a Bed for the Term (Admin › Who may apply counts them). */
    long holders(long termId);
}
