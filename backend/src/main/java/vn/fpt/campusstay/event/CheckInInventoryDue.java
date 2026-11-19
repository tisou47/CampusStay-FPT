package vn.fpt.campusstay.event;

import java.time.Instant;

/** A student's check-in inventory is not filed and its deadline comes soon (ASG). */
public record CheckInInventoryDue(long studentId, String room, Instant dueAt) {
}
