package vn.fpt.campusstay.event;

import java.time.Instant;

/** A Manager assigned an inspection schedule or run to a Staff member. */
public record InspectionAssigned(long assigneeId, String scheduleName, String runCode, Instant dueAt) {
}
