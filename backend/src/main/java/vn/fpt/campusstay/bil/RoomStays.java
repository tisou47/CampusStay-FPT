package vn.fpt.campusstay.bil;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

/**
 * Port implemented by ASG, which owns Allocations: who lived in which Room and
 * when, to split a shared meter between residents. BIL must not read ASG
 * tables and ASG already depends on BIL.
 */
public interface RoomStays {

    /**
     * A checked-in stay in a Room.
     *
     * @param from       when the student started living in the Room (check-in, or the move into it)
     * @param to         when the stay ended, null while it lasts
     * @param checkedOut the stay ended with a check-out, whose utility share was settled from the Utility Deposit
     */
    record Stay(long allocationId, long studentId, long termId, long roomId, Instant from, Instant to,
            boolean checkedOut) {
    }

    /** Stays in the Rooms that overlap the period from {@code from} (included) to {@code to} (excluded). */
    List<Stay> stays(Collection<Long> roomIds, Instant from, Instant to);
}
