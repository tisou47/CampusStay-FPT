package vn.fpt.campusstay.event;

import java.time.Instant;

/** A student invited another one to share a 2-bed Room (Notifications: in-app notification to the invitee). */
public record RoommateInvited(long invitationId, long inviteeStudentId, String fromName, String roomTypeName,
        String termName, Instant expiresAt) {
}
