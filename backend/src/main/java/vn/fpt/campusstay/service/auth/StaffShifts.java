package vn.fpt.campusstay.service.auth;

import java.sql.Time;
import java.time.Clock;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;

/**
 * Staff members' weekly shifts, set by a Manager: a weekday (ISO, 1 = Monday) and a time span on campus time. A span
 * that ends before it starts runs past midnight into the next day. Someone with no shift is never inside one.
 */
@Service
public class StaffShifts {

    /** {@code start} and {@code end} as {@code HH:mm}. */
    public record Shift(int weekday, String start, String end) {
    }

    static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    private final JdbcClient jdbc;
    private final Clock clock;

    StaffShifts(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<Shift> of(long userId) {
        return of(List.of(userId)).getOrDefault(userId, List.of());
    }

    /** Each person's shifts, by weekday then start. */
    @Transactional(readOnly = true)
    public Map<Long, List<Shift>> of(Collection<Long> userIds) {
        Map<Long, List<Shift>> out = new HashMap<>();
        if (userIds.isEmpty()) {
            return out;
        }
        jdbc.sql("""
                SELECT user_id, weekday, start_time, end_time FROM auth_staff_shift WHERE user_id IN (:ids)
                ORDER BY weekday, start_time
                """).param("ids", List.copyOf(userIds))
                .query((rs, i) -> {
                    out.computeIfAbsent(rs.getLong("user_id"), k -> new java.util.ArrayList<>())
                            .add(new Shift(rs.getInt("weekday"), rs.getTime("start_time").toLocalTime().format(HH_MM),
                                    rs.getTime("end_time").toLocalTime().format(HH_MM)));
                    return null;
                }).list();
        return out;
    }

    /** Replaces the person's shifts (already checked by the caller). */
    @Transactional
    public void replace(long userId, List<Shift> shifts) {
        jdbc.sql("DELETE FROM auth_staff_shift WHERE user_id = :id").param("id", userId).update();
        for (Shift s : shifts) {
            jdbc.sql("""
                    INSERT INTO auth_staff_shift (user_id, weekday, start_time, end_time) VALUES (:id, :d, :s, :e)
                    ON CONFLICT DO NOTHING
                    """).param("id", userId).param("d", s.weekday())
                    .param("s", Time.valueOf(LocalTime.parse(s.start()))).param("e", Time.valueOf(LocalTime.parse(s.end())))
                    .update();
        }
    }

    /** Now on campus time. */
    public ZonedDateTime now() {
        return ZonedDateTime.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
    }

    /** Whether {@code at} falls inside one of the shifts (an overnight shift counts on the day after too). */
    public static boolean inside(List<Shift> shifts, ZonedDateTime at) {
        int today = at.getDayOfWeek().getValue();
        int yesterday = today == 1 ? 7 : today - 1;
        LocalTime t = at.toLocalTime();
        for (Shift s : shifts) {
            LocalTime start = LocalTime.parse(s.start());
            LocalTime end = LocalTime.parse(s.end());
            if (start.isBefore(end)) {
                if (s.weekday() == today && !t.isBefore(start) && t.isBefore(end)) {
                    return true;
                }
            } else if ((s.weekday() == today && !t.isBefore(start)) || (s.weekday() == yesterday && t.isBefore(end))) {
                return true;
            }
        }
        return false;
    }

    /** Today's shifts as text ("07:00–15:00, 19:00–23:00"), or null when none. */
    public static String today(List<Shift> shifts, ZonedDateTime at) {
        int today = at.getDayOfWeek().getValue();
        List<String> spans = shifts.stream().filter(s -> s.weekday() == today)
                .sorted(Comparator.comparing(Shift::start)).map(s -> s.start() + "–" + s.end()).toList();
        return spans.isEmpty() ? null : String.join(", ", spans);
    }
}
