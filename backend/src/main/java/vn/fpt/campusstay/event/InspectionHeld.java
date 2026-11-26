package vn.fpt.campusstay.event;

/**
 * A Manager paused ({@code paused}) or resumed the schedule of an open inspection run (MNT): its inspector is told
 * that the run is on hold (nothing can be saved) or open again.
 */
public record InspectionHeld(long inspectorId, String scheduleName, String runCode, boolean paused) {
}
