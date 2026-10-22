package vn.fpt.campusstay.event;

import java.time.Instant;

/** A Waitlisted student received Round-2 options (Notifications: "New room options"). */
public record Round2Offered(long applicationId, long studentId, Instant expiresAt) {
}
