package vn.fpt.campusstay.event;

import java.time.Instant;

/** The student's check-in inventory is final and Utility is counted from {@code utilityFrom} (ASG). */
public record CheckInInventoryFinal(long studentId, String room, Instant utilityFrom) {
}
