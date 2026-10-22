package vn.fpt.campusstay.event;

import java.time.Instant;

/** Published in the Applications transaction that creates an Application and its Deposit Invoice (Notifications: "Pay your Deposit"). */
public record ApplicationCreated(long applicationId, String applicationCode, long studentId, String termName,
        long depositAmount, Instant depositDueAt, String depositInvoiceCode) {
}
