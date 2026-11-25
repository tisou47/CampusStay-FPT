package vn.fpt.campusstay.service.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.config.MailProperties;

/** Review finding BE-PLT-13: retries back off, then the email is given up as FAILED. */
@SpringBootTest
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class EmailOutboxDispatcherIT {

    @MockitoBean
    EmailSender sender;

    @Autowired
    EmailOutboxDispatcher dispatcher;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    MailProperties props;

    /** TC-NTF-048: a failing SMTP send counts an attempt, moves not_before later, and stops as FAILED at the maximum. */
    @Test
    void failingSendBacksOffThenGivesUp() throws Exception {
        doThrow(new IllegalStateException("SMTP down")).when(sender).send(anyString(), anyString(), anyString(), anyBoolean());
        jdbc.sql("DELETE FROM ntf_email_outbox").update();
        long id = jdbc.sql("""
                INSERT INTO ntf_email_outbox (to_email, subject, body_html, not_before)
                VALUES ('an.nv@student.campusstay.test', 'Test', '<p>x</p>', now() - interval '1 minute') RETURNING id
                """).query(Long.class).single();
        Instant previous = Instant.EPOCH;
        for (int attempt = 1; attempt <= props.maxAttempts(); attempt++) {
            jdbc.sql("UPDATE ntf_email_outbox SET not_before = now() - interval '1 minute' WHERE id = :id AND status = 'PENDING'")
                    .param("id", id).update();
            dispatcher.dispatchOnce();
            var row = jdbc.sql("SELECT attempts, status, not_before FROM ntf_email_outbox WHERE id = :id").param("id", id)
                    .query((rs, i) -> new Object[] { rs.getInt(1), rs.getString(2), rs.getTimestamp(3).toInstant() })
                    .single();
            assertThat((int) row[0]).isEqualTo(attempt);
            assertThat(row[1]).isEqualTo(attempt < props.maxAttempts() ? "PENDING" : "FAILED");
            assertThat((Instant) row[2]).isAfter(Instant.now().minusSeconds(5));
            previous = (Instant) row[2];
        }
        assertThat(previous).isNotNull();
    }
}
