package vn.fpt.campusstay.service.notification;

import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.event.EscalationAssigned;
import vn.fpt.campusstay.event.MeterPeriodLate;
import vn.fpt.campusstay.event.WeekScheduleReminderDue;
import vn.fpt.campusstay.event.WeekScheduleSent;
import vn.fpt.campusstay.event.WorkReassigned;

/** Notices for Staff and Managers: work handed to them or overdue. */
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

    @EventListener
    void on(WorkReassigned e) {
        notifier.notify(e.toUserId(), "WORK_REASSIGNED", Map.of("code", e.code(), "title", e.title(), "from", e.from(),
                "by", e.by(), "note", e.note()), e.link());
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
    void on(WeekScheduleSent e) {
        notifier.notify(e.userId(), "WEEK_SCHEDULE_SENT", Map.of("week", e.week(), "shifts", e.shifts(), "by", e.by()),
                "/staff/schedule");
    }

    @EventListener
    void on(WeekScheduleReminderDue e) {
        for (long manager : e.managerIds()) {
            notifier.notify(manager, "WEEK_SCHEDULE_REMINDER", Map.of("week", e.week(), "blocks", e.blocks()),
                    "/manager/staff");
        }
    }
}
