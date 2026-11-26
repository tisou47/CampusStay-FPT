package vn.fpt.campusstay.service.auth;

import java.util.Collection;
import java.util.Map;

/**
 * Port for Billing: the bank account each student's refunds are paid to (A-62). Students without one are left out;
 * a Manager then waits for the student to enter it before transferring.
 */
public interface RefundAccounts {

    /** @param bin the bank's NAPAS / VietQR BIN, null for a bank typed before the list (R-22) */
    record Account(String holder, String number, String bank, String bin) {
    }

    Map<Long, Account> of(Collection<Long> studentIds);

    /**
     * Clears the bank accounts of these students (Decree 13/2023: kept only while a refund needs it). Runs in the
     * caller's transaction. @return how many accounts were cleared
     */
    int clear(Collection<Long> studentIds);
}
