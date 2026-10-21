package vn.fpt.campusstay.app;

/** Staff did not approve the Application (NTF: in-app notification with the note). */
public record ApplicationRejected(long applicationId, String applicationCode, long studentId, String termName,
        String note) {
}
