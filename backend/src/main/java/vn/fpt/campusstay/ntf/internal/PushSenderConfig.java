package vn.fpt.campusstay.ntf.internal;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.http.HttpClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import tools.jackson.databind.json.JsonMapper;

/**
 * FCM when {@code campusstay.push.fcm-credentials-file} names a Firebase
 * service account key ({@code FIREBASE_CREDENTIALS_FILE}); otherwise push is
 * skipped and only the in-app notification is written.
 */
@Configuration(proxyBeanMethods = false)
class PushSenderConfig {

    private static final Logger log = LoggerFactory.getLogger(PushSenderConfig.class);

    @Bean
    PushSender pushSender(@Value("${campusstay.push.fcm-credentials-file:}") String credentialsFile, JsonMapper json,
            Clock clock) {
        if (credentialsFile == null || credentialsFile.isBlank()) {
            log.warn("FIREBASE_CREDENTIALS_FILE is not set: push notifications are skipped (in-app ones still work)");
            return (token, title, body, link) -> PushSender.Outcome.FAILED;
        }
        String credentials;
        try {
            credentials = Files.readString(Path.of(credentialsFile));
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read the Firebase credentials file", e);
        }
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(Duration.ofSeconds(10));
        return new FcmPushSender(credentials, RestClient.builder().requestFactory(factory), json, clock);
    }
}
