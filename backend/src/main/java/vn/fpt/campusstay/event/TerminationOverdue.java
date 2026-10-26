package vn.fpt.campusstay.event;

import java.time.LocalDate;

/**
 * A terminated resident has not checked out by the move-out date (spec §6.15): Managers and the Block's Staff are
 * told; the Room's door code is rotated ({@link ResidentLeftRoom} with reason {@code TERMINATION}).
 */
public record TerminationOverdue(long terminationId, long studentId, String studentName, String room,
        long buildingId, LocalDate moveOutBy) {
}
