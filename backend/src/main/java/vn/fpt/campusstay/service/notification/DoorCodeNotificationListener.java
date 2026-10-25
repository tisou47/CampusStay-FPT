package vn.fpt.campusstay.service.notification;

import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.event.DoorCodeChanged;
import vn.fpt.campusstay.event.DoorCodeToSet;

/** Door codes (spec §10): the Block's Staff hear about a code to change, residents about a new code (never the code). */
@Component
class DoorCodeNotificationListener {

    private final InAppNotifier notifier;

    DoorCodeNotificationListener(InAppNotifier notifier) {
        this.notifier = notifier;
    }

    @EventListener
    void on(DoorCodeToSet e) {
        for (long staff : e.staffIds()) {
            notifier.notify(staff, "DOOR_CODE_TO_SET", Map.of("room", e.room()), "/staff/door-codes?room=" + e.room());
        }
    }

    @EventListener
    void on(DoorCodeChanged e) {
        for (long resident : e.residentIds()) {
            notifier.notify(resident, "DOOR_CODE_CHANGED", Map.of("room", e.room()), "/student/room");
        }
    }
}
