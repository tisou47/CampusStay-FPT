package vn.fpt.campusstay.service.billing;

import java.math.BigDecimal;
import java.time.Instant;
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
     * @param type   contract type: {@code deposit}, {@code balance}, {@code utility}, {@code roomChange}, {@code damage}
     * @param status contract label, e.g. {@code Unpaid}, {@code Paid}
     * @param method {@code VietQR}, {@code Manual transfer} or null while unpaid
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
     * @param electricity final reading in kWh; null (with {@code water}) for an estimate before the reading
     * @param residents   residents of the Room for the last segment, the student included
     */
    record SettlementRequest(long termId, long studentId, long allocationId, long roomId, String room, long buildingId,
            BigDecimal electricity, BigDecimal water, long damageCharge, int residents) {
    }

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
     * A charge for a student who holds a Bed: a room-change difference ({@code ROOM_CHANGE}) or what is
     * still owed at check-out ({@code DAMAGE}). {@code title} is suffixed with the Term name.
     */
    record ChargeRequest(long termId, long studentId, Long allocationId, long buildingId, String type, String title,
            long amount, List<ChargeLine> lines, Instant dueAt, String reference) {
    }

    IssuedInvoice issueDeposit(DepositRequest request);

    /** Issues a charge Invoice and tells the student (in-app and push). */
    IssuedInvoice issueCharge(ChargeRequest request);

    /**
     * Money the dormitory owes a student outside a refund rule (a cheaper Room after a change or swap, a
     * Deposit after a declined Round-2 offer): a refund waiting for the Block Manager. {@code buildingId}
     * is null when the student holds no Bed. @return the refund id
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

    /** The Balance Invoice for a new Allocation; empty when the Deposit already covers the Term price. */
    Optional<IssuedInvoice> issueBalance(BalanceRequest request);

    /** Voids an Invoice that is not paid; a paid one is left alone. @return whether it was voided */
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

    /** Students with an unpaid or overdue Invoice in the Term (Notifications email groups). */
    Set<Long> withUnpaid(long termId);

    /**
     * Records a refund of a paid Invoice by an active refund rule (Admin › Fees). Rules approved by
     * the System are approved at once; the others wait for their approver.
     *
     * @param ruleTriggerCode e.g. {@code CANCEL_BEFORE_RESULTS}
     * @return the refund id, or empty when nothing was paid or no rule is active
     */
    Optional<Long> requestRefund(long invoiceId, String sourceType, long sourceId, String reason,
            String ruleTriggerCode);
}
