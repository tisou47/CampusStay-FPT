package vn.fpt.campusstay.service.auth;

import java.util.Collection;
import java.util.Map;

/**
 * Port for Billing: the bank account each student's refunds are paid to (A-62). Students without one are left out;
 * a Manager then waits for the student to enter it before transferring.
 */
public interface RefundAccounts {

    record Account(String holder, String number, String bank) {
    }

    Map<Long, Account> of(Collection<Long> studentIds);
}
