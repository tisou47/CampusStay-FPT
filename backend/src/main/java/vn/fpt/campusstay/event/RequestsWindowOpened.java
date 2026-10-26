package vn.fpt.campusstay.event;

import java.time.Instant;
import java.util.List;

/**
 * M2 of a Term (spec §5.1): next-Term Allocations were created for the residents of the Term before it.
 * Notifications tells each continuing resident where they stay and asks those in the last Term of their Stay to
 * extend it.
 *
 * @param students one line per resident with a next-Term Allocation
 */
public record RequestsWindowOpened(long termId, String termName, Instant closesAt, List<Continuing> students) {

    /** @param termsLeft Terms left on the Stay after the current one; 0 = its last Term (awaiting extension) */
    public record Continuing(long studentId, String room, int termsLeft) {
    }
}
