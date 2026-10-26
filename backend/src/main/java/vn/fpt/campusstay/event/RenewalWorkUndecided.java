package vn.fpt.campusstay.event;

import java.time.Instant;

/**
 * Before the decision deadline (M4) of a Term's requests window, next-Term requests are still undecided or
 * reconciliation items still open (spec §5.1, §10): Notifications alerts every Manager once.
 */
public record RenewalWorkUndecided(long termId, String termName, long requests, long reconciliationItems,
        Instant dueAt) {
}
