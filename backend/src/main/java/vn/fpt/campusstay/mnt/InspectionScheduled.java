package vn.fpt.campusstay.mnt;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * An inspection run starts in a Block (NTF: "Room inspection" to the residents of its Rooms, when the
 * schedule notifies them).
 *
 * @param studentIds residents checked in to the Rooms of the run
 */
public record InspectionScheduled(long runId, String code, List<Long> studentIds, LocalDate from, Instant dueAt) {
}
