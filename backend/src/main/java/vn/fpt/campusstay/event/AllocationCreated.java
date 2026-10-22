package vn.fpt.campusstay.event;

import java.time.Instant;

/**
 * Published in the Assignment transaction that commits a Block: the student holds a Bed
 * (Notifications: "Your room is ready"). {@code balanceDueAt} is null when no Balance is due.
 */
public record AllocationCreated(long allocationId, long studentId, String termName, String room, String bed,
        Instant balanceDueAt) {
}
