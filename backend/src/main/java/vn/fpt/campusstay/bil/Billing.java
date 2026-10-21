package vn.fpt.campusstay.bil;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * BIL public API: issuing and reading Invoices for other modules. Invoices are
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
     */
    record InvoiceLine(long id, String code, String type, String title, long amount, String status, Instant dueAt,
            Instant paidAt) {
    }

    /** Invoices of a student in a Term: how many are due and the next one to pay. */
    record DueSummary(long due, long total, Optional<InvoiceLine> next) {
    }

    IssuedInvoice issueDeposit(DepositRequest request);

    /** Voids an Invoice that is not paid; a paid one is left alone. @return whether it was voided */
    boolean voidUnpaid(long invoiceId, String reason);

    boolean isPaid(long invoiceId);

    List<InvoiceLine> invoicesOfApplication(long applicationId);

    DueSummary dueSummary(long studentId, long termId);

    /** Any Invoice of the student, from any Term, that is Overdue. */
    boolean hasOverdueInvoice(long studentId);

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
