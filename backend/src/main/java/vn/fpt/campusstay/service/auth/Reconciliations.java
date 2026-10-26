package vn.fpt.campusstay.service.auth;

import java.time.Instant;

/**
 * Accounts public API: the state of a Term's enrollment reconciliation (spec §6.12). The next-Term fees wait until
 * the enrolled list was reconciled and no item of groups 1–2 is open.
 */
public interface Reconciliations {

    /**
     * @param runs      files reconciled for the Term
     * @param openItems items of groups 1–2 not resolved yet, over every file of the Term
     * @param lastAt    when the latest file was reconciled, null without one
     */
    record Status(long runs, long openItems, Instant lastAt) {

        public boolean resolved() {
            return runs > 0 && openItems == 0;
        }
    }

    Status status(long termId);
}
