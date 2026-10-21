package vn.fpt.campusstay.app;

import java.time.Instant;

/** Published in the APP transaction that creates an Application and its Deposit Invoice (NTF: "Pay your Deposit"). */
public record ApplicationCreated(long applicationId, String applicationCode, long studentId, String termName,
        long depositAmount, Instant depositDueAt, String depositInvoiceCode) {
}
