package vn.fpt.campusstay.bil.internal;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Optional;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.shared.time.TimeConfig;

/**
 * Stores every bank-feed delivery first (raw payload kept), deduplicated by the
 * provider's transaction id, which stays the same across SePay retries.
 */
@Component
class SepayInbox {

    /** SePay webhook body; amounts in VND, {@code transactionDate} in Vietnam time. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record Transfer(Long id, String gateway, String transactionDate, String accountNumber, String code,
            String content, String transferType, Long transferAmount, String referenceCode) {
    }

    private static final DateTimeFormatter SEPAY_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final JdbcClient jdbc;
    private final Clock clock;

    SepayInbox(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** @return the new row id, or empty when this delivery was stored before */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<Long> store(String provider, String providerTxnId, Transfer t, String raw) {
        return jdbc.sql("""
                INSERT INTO bil_bank_transaction (provider, provider_txn_id, gateway, account_number, transaction_at,
                                                  transfer_type, amount, content, code, reference_code, raw)
                VALUES (:provider, :txn, :gateway, :account, :at, :type, :amount, :content, :code, :reference,
                        CAST(:raw AS jsonb))
                ON CONFLICT (provider, provider_txn_id) DO NOTHING
                RETURNING id
                """)
                .param("provider", provider)
                .param("txn", providerTxnId)
                .param("gateway", t.gateway())
                .param("account", t.accountNumber())
                .param("at", Timestamp.from(time(t.transactionDate())))
                .param("type", "out".equalsIgnoreCase(t.transferType()) ? "out" : "in")
                .param("amount", t.transferAmount() == null ? 0 : t.transferAmount())
                .param("content", truncate(t.content(), 500))
                .param("code", truncate(t.code(), 40))
                .param("reference", truncate(t.referenceCode(), 60))
                .param("raw", raw)
                .query(Long.class).optional();
    }

    private Instant time(String value) {
        if (value == null || value.isBlank()) {
            return Instant.now(clock);
        }
        try {
            return LocalDateTime.parse(value.trim(), SEPAY_TIME).atZone(TimeConfig.CAMPUS_ZONE).toInstant();
        } catch (DateTimeParseException e) {
            return Instant.now(clock);
        }
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
