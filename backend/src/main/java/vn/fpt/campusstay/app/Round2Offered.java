package vn.fpt.campusstay.app;

import java.time.Instant;

/** A Waitlisted student received Round-2 options (NTF: "New room options"). */
public record Round2Offered(long applicationId, long studentId, Instant expiresAt) {
}
