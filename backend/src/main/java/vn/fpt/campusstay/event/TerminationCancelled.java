package vn.fpt.campusstay.event;

/** A Manager cancelled a termination (spec §6.15). */
public record TerminationCancelled(long terminationId, long studentId, String room) {
}
