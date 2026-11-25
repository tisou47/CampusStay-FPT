package vn.fpt.campusstay.event;

import java.time.Instant;

/**
 * A new resident received the door code on the check-in day (ASG): their check-in inventory is open until
 * {@code dueAt}, the end of the Term's check-in period.
 */
public record CheckInAvailable(long studentId, String room, Instant dueAt) {
}
