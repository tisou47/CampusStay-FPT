package vn.fpt.campusstay.service.setting;

/**
 * Port implemented by Billing: whether a Term has Invoices. Once it has one, its price table, Deposit and Utility
 * Deposit are locked (spec §5.2), so no Invoice can disagree with the Term it was issued for.
 */
public interface TermInvoices {

    boolean anyIssued(long termId);
}
