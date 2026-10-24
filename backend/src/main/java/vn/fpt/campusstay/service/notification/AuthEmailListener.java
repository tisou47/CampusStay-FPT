package vn.fpt.campusstay.service.notification;

import java.time.format.DateTimeFormatter;
import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.event.PasswordResetRequested;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.service.auth.UserDirectory;

/**
 * Synchronous listener: runs in the publisher's transaction, so the outbox row
 * commits together with the one-time token (no lost or orphan emails).
 */
@Component
class AuthEmailListener {

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);

    private final EmailOutbox outbox;
    private final UserDirectory users;

    AuthEmailListener(EmailOutbox outbox, UserDirectory users) {
        this.outbox = outbox;
        this.users = users;
    }

    @EventListener
    void on(PasswordResetRequested event) {
        String template = "INVITE".equals(event.purpose()) ? "ACCOUNT_INVITE" : "PASSWORD_RESET";
        outbox.enqueue(template, event.email(), users.locale(event.userId()), Map.of(
                "name", event.name(),
                "link", event.link(),
                "expiresAt", WHEN.format(event.expiresAt())));
    }
}
