package vn.fpt.campusstay.config;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code campusstay.mail.*}: sender address and outbox retry policy. */
@ConfigurationProperties("campusstay.mail")
public record MailProperties(String from, int batchSize, int maxAttempts, Duration retryBase) {
}
