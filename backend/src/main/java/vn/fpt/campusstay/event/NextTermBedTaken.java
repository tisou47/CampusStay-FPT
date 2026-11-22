package vn.fpt.campusstay.event;

/**
 * The requests window opened and a resident's Bed is already given to someone else in the next Term: they keep no
 * next-Term Allocation until a Manager places them (review finding BE-ASG-09).
 */
public record NextTermBedTaken(long studentId, String room, String term) {
}
