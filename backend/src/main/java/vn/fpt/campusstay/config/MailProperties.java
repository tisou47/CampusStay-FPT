package vn.fpt.campusstay.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code campusstay.mail.*}: sender address, outbox retry policy and the demo redirect.
 *
 * @param redirectTo when set (demo servers), every email goes to this one mailbox instead of its recipient, whose
 *                   address is put in front of the subject; blank = normal delivery
 */
@ConfigurationProperties("campusstay.mail")
public record MailProperties(String from, int batchSize, int maxAttempts, Duration retryBase, String redirectTo) {

    public boolean redirecting() {
        return redirectTo != null && !redirectTo.isBlank();
    }
}
