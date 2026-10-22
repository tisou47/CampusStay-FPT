package vn.fpt.campusstay.service.notification;

import java.time.format.DateTimeFormatter;
import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.event.PasswordResetRequested;
import vn.fpt.campusstay.config.TimeConfig;

/**
 * Synchronous listener: runs in the publisher's transaction, so the outbox row
 * commits together with the one-time token (no lost or orphan emails).
 */
@Component
class AuthEmailListener {

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);

    private final EmailOutbox outbox;

    AuthEmailListener(EmailOutbox outbox) {
        this.outbox = outbox;
    }

    @EventListener
    void on(PasswordResetRequested event) {
        String template = "INVITE".equals(event.purpose()) ? "ACCOUNT_INVITE" : "PASSWORD_RESET";
        outbox.enqueue(template, event.email(), Map.of(
                "name", event.name(),
                "link", event.link(),
                "expiresAt", WHEN.format(event.expiresAt())));
    }
}
