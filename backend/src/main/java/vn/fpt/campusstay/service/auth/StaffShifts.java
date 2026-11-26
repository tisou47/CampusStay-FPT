package vn.fpt.campusstay.service.auth;

import java.sql.Date;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * Staff members' shifts on campus time: a weekday (ISO, 1 = Monday) and a time span; a span that ends before it starts
 * runs past midnight into the next day. Each person has default weekly shifts ({@code auth_staff_shift}); a Manager may
 * plan a given week differently ({@code auth_staff_week}, {@code auth_staff_week_shift}), and a week not planned uses
 * the default. Someone with no shift in a week is never inside one.
 */
@Service
public class StaffShifts {

    /** {@code start} and {@code end} as {@code HH:mm}. */
    public record Shift(int weekday, String start, String end) {
    }

    /** Where a person stands now: inside a shift, and today's spans ({@code null} when none). */
    public record Now(boolean inShift, String today) {
    }

    static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");
    static final int MAX_SHIFTS = 21;

    private static final Comparator<Shift> ORDER = Comparator.comparingInt(Shift::weekday).thenComparing(Shift::start);

    private final JdbcClient jdbc;
    private final Clock clock;

    StaffShifts(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** Now on campus time. */
    public ZonedDateTime now() {
        return ZonedDateTime.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
    }

    /** The Monday of the week holding {@code day}. */
    public static LocalDate mondayOf(LocalDate day) {
        return day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    // ---------------------------------------------------------------- default weekly shifts

    @Transactional(readOnly = true)
    public List<Shift> of(long userId) {
        return of(List.of(userId)).getOrDefault(userId, List.of());
    }

    /** Each person's default weekly shifts, by weekday then start. */
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
                .query((rs, i) -> out.computeIfAbsent(rs.getLong("user_id"), k -> new ArrayList<>())
                        .add(new Shift(rs.getInt("weekday"), rs.getTime("start_time").toLocalTime().format(HH_MM),
                                rs.getTime("end_time").toLocalTime().format(HH_MM))))
                .list();
        return out;
    }

    /** Replaces the person's default weekly shifts ({@link #clean} them first). */
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

    // ---------------------------------------------------------------- one week

    /** The people among {@code userIds} whose week starting {@code monday} a Manager planned. */
    @Transactional(readOnly = true)
    public Set<Long> planned(Collection<Long> userIds, LocalDate monday) {
        if (userIds.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jdbc.sql("SELECT user_id FROM auth_staff_week WHERE week_start = :w AND user_id IN (:ids)")
                .param("w", Date.valueOf(monday)).param("ids", List.copyOf(userIds)).query(Long.class).list());
    }

    /** Each person's shifts in the week starting {@code monday}: the planned week, else the default. */
    @Transactional(readOnly = true)
    public Map<Long, List<Shift>> forWeek(Collection<Long> userIds, LocalDate monday) {
        Map<Long, List<Shift>> out = new HashMap<>();
        if (userIds.isEmpty()) {
            return out;
        }
        Set<Long> planned = planned(userIds, monday);
        Map<Long, List<Shift>> defaults = of(userIds);
        for (long id : userIds) {
            out.put(id, planned.contains(id) ? new ArrayList<>() : defaults.getOrDefault(id, List.of()));
        }
        if (!planned.isEmpty()) {
            jdbc.sql("""
                    SELECT user_id, weekday, start_time, end_time FROM auth_staff_week_shift
                    WHERE week_start = :w AND user_id IN (:ids) ORDER BY weekday, start_time
                    """).param("w", Date.valueOf(monday)).param("ids", List.copyOf(planned))
                    .query((rs, i) -> out.get(rs.getLong("user_id"))
                            .add(new Shift(rs.getInt("weekday"), rs.getTime("start_time").toLocalTime().format(HH_MM),
                                    rs.getTime("end_time").toLocalTime().format(HH_MM))))
                    .list();
        }
        return out;
    }

    /** Plans the person's week starting {@code monday} ({@link #clean} the shifts first); an empty list is a week off. */
    @Transactional
    public void replaceWeek(long userId, LocalDate monday, List<Shift> shifts, long by) {
        jdbc.sql("""
                INSERT INTO auth_staff_week (user_id, week_start, updated_at, updated_by) VALUES (:u, :w, :at, :by)
                ON CONFLICT (user_id, week_start) DO UPDATE SET updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
                """).param("u", userId).param("w", Date.valueOf(monday)).param("at", Timestamp.from(now().toInstant()))
                .param("by", by).update();
        jdbc.sql("DELETE FROM auth_staff_week_shift WHERE user_id = :u AND week_start = :w").param("u", userId)
                .param("w", Date.valueOf(monday)).update();
        for (Shift s : shifts) {
            jdbc.sql("""
                    INSERT INTO auth_staff_week_shift (user_id, week_start, weekday, start_time, end_time)
                    VALUES (:u, :w, :d, :s, :e) ON CONFLICT DO NOTHING
                    """).param("u", userId).param("w", Date.valueOf(monday)).param("d", s.weekday())
                    .param("s", Time.valueOf(LocalTime.parse(s.start()))).param("e", Time.valueOf(LocalTime.parse(s.end())))
                    .update();
        }
    }

    /** Drops the plan of the person's week: it uses the default weekly shifts again. */
    @Transactional
    public void resetWeek(long userId, LocalDate monday) {
        jdbc.sql("DELETE FROM auth_staff_week WHERE user_id = :u AND week_start = :w").param("u", userId)
                .param("w", Date.valueOf(monday)).update();
    }

    // ---------------------------------------------------------------- now

    @Transactional(readOnly = true)
    public Now nowOf(long userId) {
        return nowOf(List.of(userId)).get(userId);
    }

    /** Whether each person is inside a shift now, from this week's shifts (and last week's for a Sunday night). */
    @Transactional(readOnly = true)
    public Map<Long, Now> nowOf(Collection<Long> userIds) {
        ZonedDateTime at = now();
        LocalDate monday = mondayOf(at.toLocalDate());
        Map<Long, List<Shift>> thisWeek = forWeek(userIds, monday);
        Map<Long, List<Shift>> lastWeek = at.getDayOfWeek() == DayOfWeek.MONDAY ? forWeek(userIds, monday.minusWeeks(1))
                : thisWeek;
        Map<Long, Now> out = new HashMap<>();
        for (long id : userIds) {
            List<Shift> mine = thisWeek.getOrDefault(id, List.of());
            out.put(id, new Now(inside(mine, lastWeek.getOrDefault(id, List.of()), at), today(mine, at)));
        }
        return out;
    }

    /** Whether {@code at} falls inside one of the shifts (an overnight shift counts on the day after too). */
    public static boolean inside(List<Shift> shifts, ZonedDateTime at) {
        return inside(shifts, shifts, at);
    }

    /** As {@link #inside(List, ZonedDateTime)}, with yesterday's overnight shifts taken from {@code yesterdayWeek}. */
    public static boolean inside(List<Shift> week, List<Shift> yesterdayWeek, ZonedDateTime at) {
        int today = at.getDayOfWeek().getValue();
        int yesterday = today == 1 ? 7 : today - 1;
        LocalTime t = at.toLocalTime();
        for (Shift s : week) {
            LocalTime start = LocalTime.parse(s.start());
            LocalTime end = LocalTime.parse(s.end());
            if (s.weekday() == today && !t.isBefore(start) && (start.isBefore(end) ? t.isBefore(end) : true)) {
                return true;
            }
        }
        for (Shift s : yesterdayWeek) {
            LocalTime start = LocalTime.parse(s.start());
            LocalTime end = LocalTime.parse(s.end());
            if (s.weekday() == yesterday && !start.isBefore(end) && t.isBefore(end)) {
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

    // ---------------------------------------------------------------- checks

    /** Checks and normalises shifts sent by a Manager ({@code 400 details.fields.shifts}); sorted, duplicates dropped. */
    public static List<Shift> clean(List<Shift> wanted) {
        List<Shift> list = wanted == null ? List.of() : wanted;
        if (list.size() > MAX_SHIFTS) {
            throw FieldErrors.single("shifts", "Give at most 21 shifts a week.");
        }
        List<Shift> clean = new ArrayList<>();
        for (Shift s : list) {
            if (s == null || s.start() == null || s.end() == null) {
                throw FieldErrors.single("shifts", "Enter each shift's start and end as HH:mm.");
            }
            LocalTime start;
            LocalTime end;
            try {
                start = LocalTime.parse(s.start().trim());
                end = LocalTime.parse(s.end().trim());
            } catch (RuntimeException e) {
                throw FieldErrors.single("shifts", "Enter each shift's start and end as HH:mm.");
            }
            if (s.weekday() < 1 || s.weekday() > 7) {
                throw FieldErrors.single("shifts", "Choose a weekday for each shift.");
            }
            if (start.equals(end)) {
                throw FieldErrors.single("shifts", "A shift must end at another time than it starts.");
            }
            Shift c = new Shift(s.weekday(), start.format(HH_MM), end.format(HH_MM));
            if (!clean.contains(c)) {
                clean.add(c);
            }
        }
        clean.sort(ORDER);
        refuseOverlaps(clean);
        return clean;
    }

    private static final int DAY = 24 * 60;
    private static final int WEEK = 7 * DAY;

    /** The shift as minutes from Monday 00:00; an overnight shift ends on the next day (Sunday's on the next Monday). */
    private static int[] span(Shift s) {
        int start = (s.weekday() - 1) * DAY + LocalTime.parse(s.start()).toSecondOfDay() / 60;
        int end = (s.weekday() - 1) * DAY + LocalTime.parse(s.end()).toSecondOfDay() / 60;
        return new int[] { start, end <= start ? end + DAY : end };
    }

    /**
     * Refuses two shifts of the week that overlap ({@code 400 details.fields.shifts}): one person works one shift at a
     * time. Shifts that meet (07:00–15:00 then 15:00–23:00) do not overlap; a Sunday night shift runs into Monday.
     */
    public static void refuseOverlaps(List<Shift> list) {
        for (int i = 0; i < list.size(); i++) {
            int[] a = span(list.get(i));
            for (int j = i + 1; j < list.size(); j++) {
                int[] b = span(list.get(j));
                for (int wrap : new int[] { -WEEK, 0, WEEK }) {
                    if (a[0] < b[1] + wrap && b[0] + wrap < a[1]) {
                        throw FieldErrors.single("shifts", "Two shifts overlap. Each shift must start after the one before it ends.");
                    }
                }
            }
        }
    }

    /**
     * A week plan for the week holding {@code today}: the days before today keep the shifts {@code before} records (a
     * past day cannot be changed), today and the days after take {@code wanted}.
     */
    public static List<Shift> keepPastDays(List<Shift> before, List<Shift> wanted, LocalDate today) {
        int day = today.getDayOfWeek().getValue();
        List<Shift> out = new ArrayList<>(before.stream().filter(s -> s.weekday() < day).toList());
        wanted.stream().filter(s -> s.weekday() >= day).forEach(out::add);
        out.sort(ORDER);
        return out;
    }

    /** "Mon 07:00–15:00, …" for the Audit Log. */
    static String text(List<Shift> list) {
        String[] days = { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" };
        return list.isEmpty() ? "none"
                : String.join(", ", list.stream().map(s -> days[s.weekday() - 1] + " " + s.start() + "–" + s.end()).toList());
    }
}
