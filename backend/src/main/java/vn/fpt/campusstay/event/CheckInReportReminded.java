package vn.fpt.campusstay.event;

import java.time.LocalDate;

/**
 * The check-in desk reminded a student who has not filed the check-in inventory (ASG): {@code message} is the
 * Staff's own text, or null for the standard reminder with the Term's check-in period.
 */
public record CheckInReportReminded(long studentId, String room, String term, LocalDate checkInStart,
        LocalDate checkInEnd, String message) {
}
