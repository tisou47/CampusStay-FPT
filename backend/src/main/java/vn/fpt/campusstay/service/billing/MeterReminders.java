package vn.fpt.campusstay.service.billing;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.MeterPeriodLate;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.setting.UtilityPolicy;

/**
 * Utility Invoices exist only once Staff close a Block's month (D-16), so nothing may be forgotten: every active
 * Block gets this month's meter period without waiting for someone to open the screen, and once a month ended more
 * than {@code utility.close_days} ago with its period still open, the Block's Staff are reminded once a day.
 */
@Component
class MeterReminders {

    private static final DateTimeFormatter LABEL = DateTimeFormatter.ofPattern("MM/yyyy");

    private record Late(long id, long buildingId, String label, LocalDate end) {
    }

    private final JdbcClient jdbc;
    private final BlockDirectory blocks;
    private final UserDirectory users;
    private final UtilityPolicy utility;
    private final Parameters parameters;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    MeterReminders(JdbcClient jdbc, BlockDirectory blocks, UserDirectory users, UtilityPolicy utility,
            Parameters parameters, ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.blocks = blocks;
        this.users = users;
        this.utility = utility;
        this.parameters = parameters;
        this.events = events;
        this.clock = clock;
    }

    /** @return the late periods whose Staff were reminded now */
    @Transactional
    int run() {
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        LocalDate start = today.withDayOfMonth(1);
        LocalDate end = today.withDayOfMonth(today.lengthOfMonth());
        Instant due = end.plusDays(1 + utility.prices().paymentDueDays()).atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant();
        for (long building : blocks.allActiveIds()) {
            jdbc.sql("""
                    INSERT INTO bil_meter_period (building_id, label, period_start, period_end, due_at)
                    VALUES (:b, :label, :start, :end, :due) ON CONFLICT (building_id, period_start) DO NOTHING
                    """).param("b", building).param("label", LABEL.format(start)).param("start", start)
                    .param("end", end).param("due", Timestamp.from(due)).update();
        }
        int closeDays = Math.max(0, parameters.intValue("utility.close_days"));
        List<Late> late = jdbc.sql("""
                SELECT id, building_id, label, period_end FROM bil_meter_period
                WHERE closed_at IS NULL AND period_end + :days < :today
                  AND (reminded_on IS NULL OR reminded_on < :today)
                ORDER BY period_start, building_id
                """).param("days", closeDays).param("today", today)
                .query((rs, i) -> new Late(rs.getLong("id"), rs.getLong("building_id"), rs.getString("label"),
                        rs.getObject("period_end", LocalDate.class)))
                .list();
        if (late.isEmpty()) {
            return 0;
        }
        Map<Long, String> codes = blocks.codesByIds(late.stream().map(Late::buildingId).toList());
        for (Late p : late) {
            List<Long> staff = users.staffOf(List.of(p.buildingId())).stream().map(UserDirectory.StaffMember::userId)
                    .toList();
            if (!staff.isEmpty()) {
                events.publishEvent(new MeterPeriodLate(codes.getOrDefault(p.buildingId(), "?"), p.label(),
                        ChronoUnit.DAYS.between(p.end(), today), staff));
            }
            jdbc.sql("UPDATE bil_meter_period SET reminded_on = :today WHERE id = :id").param("today", today)
                    .param("id", p.id()).update();
        }
        return late.size();
    }
}
