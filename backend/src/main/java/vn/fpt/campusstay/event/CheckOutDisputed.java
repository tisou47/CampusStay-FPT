package vn.fpt.campusstay.event;

/** A student does not agree with the furniture charges of their check-out; the Staff member who recorded them answers (ASG). */
public record CheckOutDisputed(long staffId, String student, String room, String reason) {
}
