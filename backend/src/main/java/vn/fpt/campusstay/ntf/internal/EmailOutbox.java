package vn.fpt.campusstay.ntf.internal;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Queues emails rendered from {@code ntf_email_template}. Must run inside the caller's transaction. */
@Component
class EmailOutbox {

    private final JdbcClient jdbc;

    EmailOutbox(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    void enqueue(String templateKey, String toEmail, Map<String, String> values) {
        var template = jdbc.sql("SELECT subject, body_html FROM ntf_email_template WHERE key = :key")
                .param("key", templateKey)
                .query((rs, i) -> new String[] { rs.getString("subject"), rs.getString("body_html") })
                .optional()
                .orElseThrow(() -> new IllegalStateException("Missing email template " + templateKey));
        jdbc.sql("""
                INSERT INTO ntf_email_outbox (to_email, subject, body_html)
                VALUES (:to, :subject, :body)
                """)
                .param("to", toEmail)
                .param("subject", Templates.render(template[0], values, false))
                .param("body", Templates.render(template[1], values, true))
                .update();
    }

    /** Queues an email already rendered (an Admin campaign), sent from {@code notBefore}. */
    @Transactional(propagation = Propagation.MANDATORY)
    void enqueue(long campaignId, String toEmail, String subject, String bodyHtml, Instant notBefore) {
        jdbc.sql("""
                INSERT INTO ntf_email_outbox (campaign_id, to_email, subject, body_html, not_before)
                VALUES (:campaign, :to, :subject, :body, :notBefore)
                """)
                .param("campaign", campaignId).param("to", toEmail).param("subject", subject).param("body", bodyHtml)
                .param("notBefore", Timestamp.from(notBefore)).update();
    }
}
