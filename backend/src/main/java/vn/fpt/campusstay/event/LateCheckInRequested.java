package vn.fpt.campusstay.event;

import java.time.LocalDate;

/** A student asked online for a late check-in (spec §6.9): the Managers decide it. */
public record LateCheckInRequested(long requestId, long studentId, String studentName, String studentCode, String room,
        LocalDate requestedFor) {
}
