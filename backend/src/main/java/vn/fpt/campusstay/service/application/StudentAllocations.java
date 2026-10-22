package vn.fpt.campusstay.service.application;

import java.time.Instant;
import java.util.Optional;

/**
 * Port implemented by Assignment, which owns Allocations: where an Application's
 * student was placed, for the student's Application and Home screens. Applications must
 * not read Assignment tables and Assignment already depends on Applications.
 */
public interface StudentAllocations {

    record Placement(long allocationId, String room, String bed, String block, int floor, Instant allocatedAt,
            Instant checkedInAt) {
    }

    Optional<Placement> ofApplication(long applicationId);
}
