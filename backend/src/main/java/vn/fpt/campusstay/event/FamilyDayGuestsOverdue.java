package vn.fpt.campusstay.event;

import java.time.Instant;
import java.util.List;

/**
 * The visitor desk reminded a student that their Family Day guests are still inside after their time slot (VIS,
 * contract A-70). {@code endsAt} is when the earliest of those guests' time slots ended.
 */
public record FamilyDayGuestsOverdue(long familyDayId, String title, long studentId, List<String> guests,
        Instant endsAt) {
}
