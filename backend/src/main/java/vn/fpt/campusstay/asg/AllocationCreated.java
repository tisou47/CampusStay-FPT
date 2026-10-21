package vn.fpt.campusstay.asg;

import java.time.Instant;

/**
 * Published in the ASG transaction that commits a Block: the student holds a Bed
 * (NTF: "Your room is ready"). {@code balanceDueAt} is null when no Balance is due.
 */
public record AllocationCreated(long allocationId, long studentId, String termName, String room, String bed,
        Instant balanceDueAt) {
}
