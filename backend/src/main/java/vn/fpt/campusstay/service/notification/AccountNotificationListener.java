package vn.fpt.campusstay.service.notification;

import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.event.StudentVerificationRequested;
import vn.fpt.campusstay.event.StudentVerified;

/** Student accounts (spec §10): Managers hear about an account to verify, the student about the verification. */
@Component
class AccountNotificationListener {

    private final InAppNotifier notifier;

    AccountNotificationListener(InAppNotifier notifier) {
        this.notifier = notifier;
    }

    @EventListener
    void on(StudentVerificationRequested e) {
        for (long manager : e.managerIds()) {
            notifier.notify(manager, "STUDENT_VERIFICATION_REQUESTED",
                    Map.of("name", e.name(), "studentCode", e.studentCode()), "/manager/students/" + e.userId());
        }
    }

    @EventListener
    void on(StudentVerified e) {
        notifier.notify(e.userId(), "STUDENT_VERIFIED", Map.of(), "/student");
    }
}
