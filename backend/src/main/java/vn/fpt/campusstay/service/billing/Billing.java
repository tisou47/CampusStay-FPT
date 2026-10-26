package vn.fpt.campusstay.service.billing;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Billing public API: issuing and reading Invoices for other modules. Invoices are
 * identified to clients by their code ({@code INV-SP27-000123}); other modules
 * keep the numeric id.
 */
public interface Billing {

    /** @param termPrice the Application's Term price the Deposit is a share of */
    record DepositRequest(long termId, long studentId, long applicationId, String applicationCode, long termPrice,
            long amount, Instant dueAt) {
    }

    record IssuedInvoice(long id, String code, long amount, Instant dueAt) {
    }

    /**
     * An Invoice as other modules show it.
     *
     * @param type   contract type: {@code deposit}, {@code balance}, {@code utility}, {@code roomChange}, {@code damage},
     *               {@code termFee}
     * @param status contract label, e.g. {@code Unpaid}, {@code Paid}
     * @param method {@code Bank transfer} (a confirmed claim), {@code VietQR} or {@code Manual transfer} (before
     *               phase 5), or null while unpaid
     */
    record InvoiceLine(long id, String code, String type, String title, long amount, String status, Instant dueAt,
            Instant paidAt, String method) {
    }

    /** Invoices of a student in a Term: how many are due and the next one to pay. */
    record DueSummary(long due, long total, Optional<InvoiceLine> next) {
    }

    /** @param depositAmount the Deposit already invoiced; the Balance is the Term price minus it */
    record BalanceRequest(long termId, long studentId, long applicationId, String applicationCode, long allocationId,
            long buildingId, String room, long termPrice, long depositAmount, Instant dueAt) {
    }

    /** The unpaid Balance Invoice of an Allocation: the Term price part and the Utility Deposit it includes. */
    record CheckInDue(String invoiceCode, long balance, long utilityDeposit) {
    }

    /**
     * Input of a check-out settlement.
     *
     * @param stayAllocationIds every Allocation of the student's Stay (Terms and moves): the Utility Deposit is held for
     *                          the whole Stay, so it is found on any of them
     * @param electricity       final reading in kWh; null (with {@code water}) for an estimate before the reading
     * @param residents         residents of the Room for the last segment, the student included
     */
    record SettlementRequest(long termId, long studentId, long allocationId, List<Long> stayAllocationIds, long roomId,
            String room, long buildingId, BigDecimal electricity, BigDecimal water, long damageCharge, int residents) {
    }

    /**
     * A next-Term room fee (spec §6.10 step 4): 100 % of the next Term's price of the Bed's Room Type × the Room's Room
     * Class in that Term; no Deposit, the Utility Deposit stays held.
     */
    record TermFeeRequest(long termId, long studentId, long allocationId, long buildingId, String room, long price,
            Instant dueAt) {
    }

    /**
     * Records a meter reading of a Room when its residents change (spec §6.13, §5.1 M9): the Utility of the month is
     * split by time between such cuts. Refuses a reading lower than the Room's latest one ({@code 400}, fields named
     * with {@code fieldPrefix}).
     *
     * @param reason {@code MOVE} (an operational move) or {@code TURNOVER}
     */
    void recordMeterCut(long roomId, String room, BigDecimal electricity, BigDecimal water, String reason,
            Long allocationId, long recordedBy, String fieldPrefix);

    /**
     * A student moved to another Bed: the move made a new Allocation of the same Term, so the Invoices that hold the
     * Bed (the Balance and the next-Term fee) follow it. Otherwise a moved student would look unbilled (a second fee)
     * or escape the forfeit of an unpaid Balance. Runs in the caller's transaction.
     */
    void followAllocation(long fromAllocationId, long toAllocationId);

    /** Room id → the day of its latest meter cut (check-in, check-out, move, turnover); Rooms without one left out. */
    Map<Long, LocalDate> lastMeterCuts(Collection<Long> roomIds);

    /** Issues the next-Term room fee "Room fee · Term · Room" and tells the student. */
    IssuedInvoice issueTermFee(TermFeeRequest request);

    /** Allocation id → its live next-Term fee (not void); Allocations without one are left out. */
    Map<Long, InvoiceLine> termFees(Collection<Long> allocationIds);

    /** Unpaid next-Term fees past their deadline with no claim waiting for confirmation, oldest first (spec §5.1 M7). */
    List<DueBalance> termFeesPastDue();

    /** The Utility Deposit held on paid Invoices of the Allocations (VND). */
    long utilityDepositHeld(Collection<Long> allocationIds);

    /**
     * The Utility Deposit settlement shown at check-out.
     *
     * @param periodLabel what the share covers ({@code since 02/01/2031}), null without an earlier reading
     * @param refund      held − share − unpaid − damage; negative = what the student still owes
     */
    record Settlement(long held, String periodLabel, long share, long unpaid, long damage, long refund) {
    }

    /**
     * @param refundId the refund waiting for the Block Manager, when the refund is positive
     * @param invoice  the Invoice for what the student still owes, when the refund is negative
     */
    record SettledCheckOut(Settlement settlement, Optional<Long> refundId, Optional<IssuedInvoice> invoice) {
    }

    /** A line of a charge Invoice. */
    record ChargeLine(String label, long amount) {
    }

    /**
     * A charge for a student who holds a Bed: what is still owed at check-out ({@code DAMAGE}) or the difference of a
     * Room Class set back after the next-Term fee was paid ({@code ROOM_CHANGE}, spec §6.11 step 6, the only price
     * difference left). {@code title} is suffixed with the Term name.
     */
    record ChargeRequest(long termId, long studentId, Long allocationId, long buildingId, String type, String title,
            long amount, List<ChargeLine> lines, Instant dueAt, String reference) {
    }

    IssuedInvoice issueDeposit(DepositRequest request);

    /** Issues a charge Invoice and tells the student (in-app and push). */
    IssuedInvoice issueCharge(ChargeRequest request);

    /**
     * Money the dormitory owes a student outside a refund rule (a Deposit after a declined Round-2 offer, a Room Class
     * set back after the next-Term fee was paid): a refund waiting for a Manager. {@code buildingId} is null when the
     * student holds no Bed. @return the refund id
     */
    long requestCredit(long termId, long studentId, Long buildingId, String sourceType, long sourceId, String reason,
            long amount);

    /** Allocation id → its unpaid Balance; Allocations whose Balance is paid (or not issued) are left out. */
    Map<Long, CheckInDue> checkInDues(Collection<Long> allocationIds);

    /** Empty when the Balance (with its Utility Deposit) is paid or none was issued. */
    default Optional<CheckInDue> checkInDue(long allocationId) {
        return Optional.ofNullable(checkInDues(List.of(allocationId)).get(allocationId));
    }

    Settlement estimateCheckOut(SettlementRequest request);

    /**
     * Settles the Utility Deposit at check-out: records the final meter reading, settles unpaid utility
     * Invoices from the deposit, then requests the refund or invoices what is still owed.
     */
    SettledCheckOut settleCheckOut(SettlementRequest request, long recordedBy);

    /** Status label of the check-out refund of an Allocation ({@code Pending}, {@code Approved} …). */
    Optional<String> checkOutRefundStatus(long allocationId);

    /** A refund recorded by a rule: its id and amount (VND). */
    record RefundRequested(long id, long amount) {
    }

    /**
     * An unpaid Balance whose deadline passed with no claim waiting for confirmation (the forfeit job, spec §6.6).
     *
     * @param depositInvoiceId the paid Deposit of the same Application, null without one
     */
    record DueBalance(long invoiceId, String code, long allocationId, Long applicationId, long studentId, long termId,
            Instant dueAt, Long depositInvoiceId) {
    }

    /**
     * The unused part of a resident's room fee, refunded by a rule when a termination ends the stay (spec §6.15):
     * the room fee paid (Deposit + Balance without the Utility Deposit) × the days left from {@code from} to the end
     * of the stay ÷ the days of the stay × the rule's percentage.
     *
     * @param ruleTriggerCode {@code TERMINATION} or {@code NOT_ENROLLED}
     */
    record UnusedFeeRefund(long termId, long studentId, long allocationId, Long applicationId, Long buildingId,
            String sourceType, long sourceId, String reason, String ruleTriggerCode, LocalDate from,
            LocalDate stayStart, LocalDate stayEnd) {
    }

    /** Unpaid Balances past their deadline, oldest first (claims waiting stop the clock). */
    List<DueBalance> balancesPastDue();

    /**
     * Moves the deadline of the Allocation's unpaid Balance to {@code dueAt} when that is later (an approved late
     * check-in, spec §6.9); reminders start again. Never moves a deadline earlier. @return whether it moved
     */
    boolean extendBalanceDeadline(long allocationId, Instant dueAt);

    /** @return the refund, empty when nothing was paid, no rule is active or the amount is 0 */
    Optional<RefundRequested> refundUnusedRoomFee(UnusedFeeRefund request);

    /** The Balance Invoice for a new Allocation; empty when the Deposit already covers the Term price. */
    Optional<IssuedInvoice> issueBalance(BalanceRequest request);

    /**
     * Voids an Invoice that is not paid; a paid one, or one whose claim waits for a Manager, is left alone.
     * @return whether it was voided
     */
    boolean voidUnpaid(long invoiceId, String reason);

    boolean isPaid(long invoiceId);

    List<InvoiceLine> invoicesOfApplication(long applicationId);

    /** Application id → its live Deposit Invoice. */
    Map<Long, InvoiceLine> depositsOf(Collection<Long> applicationIds);

    /** Invoices by id; unknown ids are left out. */
    Map<Long, InvoiceLine> invoices(Collection<Long> invoiceIds);

    DueSummary dueSummary(long studentId, long termId);

    /** Any Invoice of the student, from any Term, that is Overdue. */
    boolean hasOverdueInvoice(long studentId);

    /** Students with an overdue Invoice of any Term (Admin › Who may apply counts them). */
    long studentsWithOverdueInvoice();

    /** Students with an unpaid or overdue Invoice in the Term (Notifications email groups). */
    Set<Long> withUnpaid(long termId);

    /**
     * Records a refund of a paid Invoice by an active refund rule (Admin › Fees). Rules approved by
     * the System are approved at once; the others wait for their approver.
     *
     * @param ruleTriggerCode e.g. {@code CANCEL_BEFORE_RESULTS}
     * @return the refund, or empty when nothing was paid, no rule is active, the rule gives 0 or the Invoice already
     *         has a refund (an Invoice is refunded once)
     */
    Optional<RefundRequested> requestRefund(long invoiceId, String sourceType, long sourceId, String reason,
            String ruleTriggerCode);
}
