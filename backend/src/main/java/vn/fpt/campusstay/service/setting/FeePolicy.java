package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;

/**
 * Settings public API: prices and the deposit/refund policy (Admin › Room Types, Room Classes, Fees).
 * <p>A Term has its own price table, Deposit percentage and Utility Deposit, fixed when it is published (ADR-20,
 * spec §5.2, §8): the methods that take a {@code termId} answer for that Term. A Term without them (written by SQL,
 * e.g. test data) reads the defaults, which only Terms built afterwards copy.
 */
public interface FeePolicy {

    /** An active refund rule, e.g. {@code CANCEL_BEFORE_RESULTS}. */
    record RefundRule(long id, String triggerCode, String description, BigDecimal refundPercent, String approverRole) {
    }

    /**
     * The Term's price per Bed of a Room Type × Room Class: its price table, else the default price. Empty when the
     * Room Type or Room Class is unknown or inactive.
     */
    OptionalLong termPrice(long termId, long roomTypeId, long roomClassId);

    /**
     * Default price per Bed for new Terms = Room Type base price × (1 + Room Class surcharge), rounded up to the
     * pricing step (system parameter). Empty when the Room Type or Room Class is unknown or inactive.
     */
    OptionalLong defaultTermPrice(long roomTypeId, long roomClassId);

    /** The Term's Deposit share of the Term price as a fraction, e.g. {@code 0.2}. */
    BigDecimal depositRate(long termId);

    /** Default Deposit share for new Terms (Admin › Deposit and refunds). */
    BigDecimal depositRate();

    /** The Term's Deposit for a Term price, rounded to the nearest VND (as the apps show it). */
    long deposit(long termId, long termPrice);

    /** The Term's Utility Deposit, collected with the Balance. */
    long utilityDeposit(long termId);

    /** Default Utility Deposit for new Terms: monthly estimate × months held (Admin › Utility). */
    long utilityDeposit();

    Optional<RefundRule> refundRule(String triggerCode);

    /** Every refund rule (inactive ones too, so old refunds still name their rule), by id. */
    Map<Long, RefundRule> refundRules();

    /** Staff may confirm a transfer by hand when the bank feed cannot (Admin › Fees). */
    boolean manualConfirmAllowed();

    /** Days after an Allocation the Balance Invoice is due (Admin › Fees). */
    int balanceDays();
}
