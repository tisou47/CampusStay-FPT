package vn.fpt.campusstay.service.notification;

import java.time.format.DateTimeFormatter;
import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.FamilyDayCancelled;
import vn.fpt.campusstay.event.FamilyDayGuestsOverdue;
import vn.fpt.campusstay.event.FamilyDayPublished;
import vn.fpt.campusstay.event.FamilyDayRegistered;
import vn.fpt.campusstay.event.FamilyDayRegistrationCancelled;

/** Family Day notices for residents (ADR-29): in the same transaction as the change they announce. */
@Component
class FamilyDayNotificationListener {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy")
            .withZone(TimeConfig.CAMPUS_ZONE);
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);

    private final InAppNotifier notifier;

    FamilyDayNotificationListener(InAppNotifier notifier) {
        this.notifier = notifier;
    }

    private static String link(long familyDayId) {
        return "/student/family-days/" + familyDayId;
    }

    @EventListener
    void on(FamilyDayPublished e) {
        Map<String, String> values = Map.of("title", e.title(), "block", e.block(), "area", e.area(),
                "date", DAY.format(e.startsAt()), "closes", WHEN.format(e.registrationClosesAt()));
        for (long student : e.studentIds()) {
            notifier.notify(student, "FAMILY_DAY_PUBLISHED", values, link(e.familyDayId()));
        }
    }

    @EventListener
    void on(FamilyDayRegistered e) {
        notifier.notify(e.studentId(), "FAMILY_DAY_REGISTERED",
                Map.of("title", e.title(), "guests", String.valueOf(e.guests()), "slot", e.slot()),
                link(e.familyDayId()));
    }

    @EventListener
    void on(FamilyDayRegistrationCancelled e) {
        notifier.notify(e.studentId(), "FAMILY_DAY_REGISTRATION_CANCELLED",
                Map.of("title", e.title(), "reason", e.reason()), link(e.familyDayId()));
    }

    @EventListener
    void on(FamilyDayGuestsOverdue e) {
        notifier.notify(e.studentId(), "FAMILY_DAY_GUESTS_OVERDUE", Map.of("title", e.title(), "guests",
                String.join(", ", e.guests()), "ends", WHEN.format(e.endsAt())), link(e.familyDayId()));
    }

    @EventListener
    void on(FamilyDayCancelled e) {
        Map<String, String> values = Map.of("title", e.title(), "reason", e.reason(),
                "date", e.startsAt() == null ? "" : DAY.format(e.startsAt()));
        for (long student : e.studentIds()) {
            notifier.notify(student, "FAMILY_DAY_CANCELLED", values, link(e.familyDayId()));
        }
    }
}
