package vn.fpt.campusstay.event;

import java.time.LocalDate;
import java.util.List;

/**
 * A Manager sent a registration-period request, or sent it again after the Admin asked for changes (spec §6.3).
 *
 * @param adminIds   every active Admin
 * @param managerIds every other active Manager
 */
public record TermRequestSubmitted(long requestId, String code, String termName, LocalDate stayStart,
        LocalDate stayEnd, String requesterName, List<Long> adminIds, List<Long> managerIds) {
}
