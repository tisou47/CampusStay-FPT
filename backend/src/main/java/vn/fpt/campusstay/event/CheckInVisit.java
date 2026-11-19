package vn.fpt.campusstay.event;

import java.time.Instant;

/** Staff will check the Room with the student before the inventory is final (ASG); {@code visitAt} may be null. */
public record CheckInVisit(long studentId, String room, Instant visitAt) {
}
