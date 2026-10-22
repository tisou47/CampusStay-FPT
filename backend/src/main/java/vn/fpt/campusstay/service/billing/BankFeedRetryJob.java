package vn.fpt.campusstay.service.billing;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Retries bank transfers left pending, e.g. when processing failed after the webhook was stored. */
@Component
class BankFeedRetryJob {

    private static final Logger log = LoggerFactory.getLogger(BankFeedRetryJob.class);

    private final JdbcClient jdbc;
    private final PaymentProcessor processor;
    private final Clock clock;

    BankFeedRetryJob(JdbcClient jdbc, PaymentProcessor processor, Clock clock) {
        this.jdbc = jdbc;
        this.processor = processor;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${campusstay.payment.retry-interval:1m}",
            initialDelayString = "${campusstay.payment.retry-interval:1m}")
    public void retryPending() {
        List<Long> pending = jdbc.sql("""
                SELECT id FROM bil_bank_transaction WHERE match_status = 'PENDING' AND received_at < :before
                ORDER BY received_at LIMIT 100
                """)
                .param("before", Timestamp.from(Instant.now(clock).minus(Duration.ofSeconds(30))))
                .query(Long.class).list();
        for (long id : pending) {
            try {
                processor.process(id);
            } catch (RuntimeException e) {
                log.warn("Bank transaction {} could not be processed: {}", id, e.getClass().getSimpleName());
            }
        }
    }
}
