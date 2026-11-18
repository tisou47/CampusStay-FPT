package vn.fpt.campusstay.event;

/** Staff recorded the Room's real condition in the visit; the student reads it and agrees (ASG). */
public record CheckInToAgree(long studentId, String room) {
}
