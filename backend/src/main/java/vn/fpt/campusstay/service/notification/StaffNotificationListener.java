package vn.fpt.campusstay.service.notification;

import java.time.format.DateTimeFormatter;
import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.EscalationAssigned;
import vn.fpt.campusstay.event.InspectionAssigned;
import vn.fpt.campusstay.event.MeterPeriodLate;

/** Notices for Staff and Managers: work handed to them or overdue. */
@Component
class StaffNotificationListener {

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy")
            .withZone(TimeConfig.CAMPUS_ZONE);

    private final InAppNotifier notifier;

    StaffNotificationListener(InAppNotifier notifier) {
        this.notifier = notifier;
    }

    @EventListener
    void on(EscalationAssigned e) {
        notifier.notify(e.assigneeId(), "ESCALATION_ASSIGNED", Map.of("code", e.code(), "title", e.title()), e.link());
    }

    @EventListener
    void on(MeterPeriodLate e) {
        for (long staff : e.staffIds()) {
            notifier.notify(staff, "METER_PERIOD_LATE",
                    Map.of("period", e.period(), "block", e.block(), "days", String.valueOf(e.days())),
                    "/staff/meter-readings");
        }
    }

    @EventListener
    void on(InspectionAssigned e) {
        notifier.notify(e.assigneeId(), "INSPECTION_ASSIGNED",
                Map.of("schedule", e.scheduleName(), "run", e.runCode(),
                        "dueAt", e.dueAt() == null ? "" : WHEN.format(e.dueAt())),
                "/staff/inspections");
    }
}
