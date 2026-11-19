package vn.fpt.campusstay.event;

/** A new resident meets every condition to receive the Room (ASG): they start the check-in inventory to get the code. */
public record CheckInAvailable(long studentId, String room, int hours) {
}
