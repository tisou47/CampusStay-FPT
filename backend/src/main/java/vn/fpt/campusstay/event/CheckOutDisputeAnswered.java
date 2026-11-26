package vn.fpt.campusstay.event;

/** Staff checked the furniture again after a student disagreed; the student reads the charges and agrees (ASG). */
public record CheckOutDisputeAnswered(long studentId, String room, long amount, String answer) {
}
