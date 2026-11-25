package vn.fpt.campusstay.service.maintenance;

import java.time.Instant;

/**
 * What MNT asks ASG about the students' check-in inventories (implemented in ASG): report 1 of a Room stops following
 * its repairs once a student started a check-in inventory on it.
 */
public interface CheckInInventories {

    /** Whether a check-in inventory of the Room was opened at or after {@code since}. */
    boolean startedSince(long roomId, Instant since);
}
