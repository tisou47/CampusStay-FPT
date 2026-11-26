package vn.fpt.campusstay.service.notification;

import java.time.Instant;

/** The email outbox seen from Admin › System health (D2): what waits, what failed for good. */
public interface EmailBacklog {

    record Backlog(long pending, long failed, Instant oldestPendingAt) {
    }

    Backlog backlog();
}
