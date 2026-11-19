package vn.fpt.campusstay.event;

import java.util.List;

/**
 * Sunday: next week's schedule is not sent yet for some Blocks (Notifications to the Managers).
 *
 * @param blocks the codes of the Blocks still waiting, comma-separated
 */
public record WeekScheduleReminderDue(List<Long> managerIds, String week, String blocks) {
}
