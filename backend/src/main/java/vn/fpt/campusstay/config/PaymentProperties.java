package vn.fpt.campusstay.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code campusstay.payment.*}: the bank account students transfer to, set by operations through environment
 * variables (ADR-22). Payments are claimed by the student ("I have transferred") and confirmed by a Manager.
 *
 * @param bankCode       bank short name for the VietQR image service, e.g. {@code MBBank}
 * @param accountNumber  blank = no account configured: the payment page shows no VietQR image
 * @param qrImageUrl     a public VietQR image service (it receives the account, amount and transfer content only)
 * @param transferPrefix start of every Invoice's transfer content ({@code CSTAY000123})
 */
@ConfigurationProperties("campusstay.payment")
public record PaymentProperties(String bankName, String bankCode, String accountNumber, String accountName,
        String qrImageUrl, String transferPrefix) {

    /** A receiving account is set, so a VietQR image can be shown (spec §6.7). */
    public boolean accountConfigured() {
        return accountNumber != null && !accountNumber.isBlank() && bankCode != null && !bankCode.isBlank();
    }
}
