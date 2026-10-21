package vn.fpt.campusstay.app;

import java.time.Instant;
import java.util.Optional;

/**
 * Port implemented by ASG, which owns Allocations: where an Application's
 * student was placed, for the student's Application and Home screens. APP must
 * not read ASG tables and ASG already depends on APP.
 */
public interface StudentAllocations {

    record Placement(long allocationId, String room, String bed, String block, int floor, Instant allocatedAt,
            Instant checkedInAt) {
    }

    Optional<Placement> ofApplication(long applicationId);
}
