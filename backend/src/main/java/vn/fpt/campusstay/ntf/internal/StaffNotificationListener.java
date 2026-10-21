package vn.fpt.campusstay.ntf.internal;

import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.req.EscalationAssigned;

/** Notices for Staff and Managers: work handed to them. */
@Component
class StaffNotificationListener {

    private final InAppNotifier notifier;

    StaffNotificationListener(InAppNotifier notifier) {
        this.notifier = notifier;
    }

    @EventListener
    void on(EscalationAssigned e) {
        notifier.notify(e.assigneeId(), "ESCALATION_ASSIGNED", Map.of("code", e.code(), "title", e.title()), e.link());
    }
}
