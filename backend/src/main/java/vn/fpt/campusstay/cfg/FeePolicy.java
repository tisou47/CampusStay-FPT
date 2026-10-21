package vn.fpt.campusstay.cfg;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;

/** CFG public API: prices and the deposit/refund policy (Admin › Room Types, Room Classes, Fees). */
public interface FeePolicy {

    /** An active refund rule, e.g. {@code CANCEL_BEFORE_RESULTS}. */
    record RefundRule(long id, String triggerCode, String description, BigDecimal refundPercent, String approverRole) {
    }

    /**
     * Term price per Bed = Room Type base price × (1 + Room Class surcharge), rounded up to the
     * pricing step (system parameter). Empty when the Room Type or Room Class is unknown or inactive.
     */
    OptionalLong termPrice(long roomTypeId, long roomClassId);

    /** Deposit share of the Term price as a fraction, e.g. {@code 0.2}. */
    BigDecimal depositRate();

    /** Deposit for a Term price, rounded to the nearest VND (as the apps show it). */
    long deposit(long termPrice);

    /** Utility Deposit collected before Check-in: monthly estimate × months held. */
    long utilityDeposit();

    Optional<RefundRule> refundRule(String triggerCode);

    /** Every refund rule (inactive ones too, so old refunds still name their rule), by id. */
    Map<Long, RefundRule> refundRules();

    /** Staff may confirm a transfer by hand when the bank feed cannot (Admin › Fees). */
    boolean manualConfirmAllowed();

    /** Days after an Allocation the Balance Invoice is due (Admin › Fees). */
    int balanceDays();
}
