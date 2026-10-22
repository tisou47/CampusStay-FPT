package vn.fpt.campusstay.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code campusstay.payment.*}: the receiving bank account and the SePay link,
 * set by operations through environment variables (ADR-08).
 *
 * @param bankCode       bank short name for the VietQR image service, e.g. {@code MBBank}
 * @param qrImageUrl     SePay's VietQR image service
 * @param transferPrefix start of every Invoice's transfer content; must match the payment-code
 *                       prefix configured in SePay so it can extract the code
 * @param sepayApiKey    key SePay sends as {@code Authorization: Apikey …}; blank disables the webhook
 */
@ConfigurationProperties("campusstay.payment")
public record PaymentProperties(String bankName, String bankCode, String accountNumber, String accountName,
        String qrImageUrl, String transferPrefix, String sepayApiKey) {
}
