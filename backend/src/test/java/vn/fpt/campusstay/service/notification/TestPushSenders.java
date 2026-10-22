package vn.fpt.campusstay.service.notification;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** A recording stand-in for FCM in integration tests; the device token {@code expired} is reported as unregistered. */
public final class TestPushSenders {

    public record Push(String token, String title, String link) {
    }

    public static final List<Push> SENT = new CopyOnWriteArrayList<>();

    private TestPushSenders() {
    }

    @TestConfiguration(proxyBeanMethods = false)
    public static class Recording {

        @Bean
        @Primary
        PushSender recordingPushSender() {
            return (token, title, body, link) -> {
                SENT.add(new Push(token, title, link));
                return token.equals("expired") ? PushSender.Outcome.INVALID_TOKEN : PushSender.Outcome.SENT;
            };
        }
    }
}
