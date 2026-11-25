package vn.fpt.campusstay.event;

/** A new resident received the door code (ASG) and is expected to file the check-in inventory within {@code hours}. */
public record CheckInAvailable(long studentId, String room, int hours) {
}
