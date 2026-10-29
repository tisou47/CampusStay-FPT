package vn.fpt.campusstay.event;

import java.time.LocalDate;

/**
 * Round 1 found no Bed of the kind the student chose (Notifications: "You are on the waitlist"). {@code until} is the
 * Term's first check-in day: a Bed not found by then ends the waitlist with a full Deposit refund.
 */
public record ApplicationWaitlisted(long applicationId, String applicationCode, long studentId, String termName,
        LocalDate until) {
}
