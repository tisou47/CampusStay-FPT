package vn.fpt.campusstay.event;

/** Staff recorded the furniture at a student's check-out; the student reads the charges and agrees (ASG). */
public record CheckOutToAgree(long studentId, String room, long amount) {
}
