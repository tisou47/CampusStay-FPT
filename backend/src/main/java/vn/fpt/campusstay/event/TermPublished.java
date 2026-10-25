package vn.fpt.campusstay.event;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * The Admin published a Term (spec §6.3 step 5, §6.4 step 7): every Manager is told (link: the Term dashboard) and
 * every student reads the Term announcement on the board until registration closes.
 *
 * @param fromPrice  the lowest price per Bed of the Term
 * @param managerIds every active Manager
 */
public record TermPublished(long termId, String termName, LocalDate stayStart, LocalDate stayEnd,
        Instant registrationOpensAt, Instant registrationClosesAt, long fromPrice, List<Long> managerIds) {
}
