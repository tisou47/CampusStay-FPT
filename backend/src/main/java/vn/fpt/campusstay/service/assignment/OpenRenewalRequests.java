package vn.fpt.campusstay.service.assignment;

import java.util.Map;

/**
 * Port implemented by Requests, which owns next-Term requests: how many are still open for a Term. The next-Term
 * fees and the assignment of new students wait for them (spec §5.1, M4 and M6); Requests already depends on
 * Assignment ({@link Moves}, {@link Stays}).
 */
public interface OpenRenewalRequests {

    /** Open next-Term requests of the Term by kind: {@code roomChanges}, {@code swaps}, {@code roomClassChanges},
     * {@code extensions}; kinds without one are left out. */
    Map<String, Long> open(long termId);

    default long total(long termId) {
        return open(termId).values().stream().mapToLong(Long::longValue).sum();
    }
}
