package vn.fpt.campusstay.event;

import java.time.Instant;

/** The Deposit is paid (and the roommate's too, for an invited pair): the Application reaches the dormitory office. */
public record ApplicationSubmitted(long applicationId, String applicationCode, long studentId, String termName,
        Instant resultsPublishedAt) {
}
