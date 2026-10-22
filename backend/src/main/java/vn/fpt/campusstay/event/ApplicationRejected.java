package vn.fpt.campusstay.event;

/** Staff did not approve the Application (Notifications: in-app notification with the note). */
public record ApplicationRejected(long applicationId, String applicationCode, long studentId, String termName,
        String note) {
}
