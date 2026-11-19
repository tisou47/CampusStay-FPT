package vn.fpt.campusstay.service.auth;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.WeekScheduleReminderDue;
import vn.fpt.campusstay.event.WeekScheduleSent;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * The weekly handover of the Staff schedule: shifts repeat every week, and a Manager sends next week's schedule to the
 * Staff of their Blocks (each Staff member is told their shifts). On the day and from the hour Admin chose
 * ({@code workload.schedule_reminder_day}, 0 = no reminder; {@code workload.schedule_reminder_hour}),
 * the Managers are reminded once while some Block's schedule is not sent.
 */
@Service
public class WeekScheduleService {

    private static final Logger log = LoggerFactory.getLogger(WeekScheduleService.class);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM");
    private static final String[] DAYS_EN = { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" };
    private static final String[] DAYS_VI = { "T2", "T3", "T4", "T5", "T6", "T7", "CN" };

    /**
     * Next week's handover in the Manager's Blocks; {@code sentAt}/{@code sentBy} the latest send; {@code reminderDay}
     * 1 = Monday … 7 = Sunday, 0 = no reminder, at {@code reminderHour}.
     */
    public record NextWeek(LocalDate start, LocalDate end, List<String> sentBlocks, List<String> pendingBlocks,
            Instant sentAt, String sentBy, int reminderDay, int reminderHour) {
    }

    public record Sent(LocalDate start, int notified, List<String> blocks) {
    }

    private record Person(long id, String locale) {
    }

    private final JdbcClient jdbc;
    private final Clock clock;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blocks;
    private final StaffShifts shifts;
    private final Parameters parameters;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;

    WeekScheduleService(JdbcClient jdbc, Clock clock, CurrentUser currentUser, BlockScope blockScope,
            BlockDirectory blocks, StaffShifts shifts, Parameters parameters, ApplicationEventPublisher events,
            AuditLog audit) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blocks = blocks;
        this.shifts = shifts;
        this.parameters = parameters;
        this.events = events;
        this.audit = audit;
    }

    /** The Monday of the week after today (on Sunday: tomorrow). */
    static LocalDate nextMonday(ZonedDateTime now) {
        return now.toLocalDate().with(TemporalAdjusters.next(DayOfWeek.MONDAY));
    }

    static String weekText(LocalDate monday) {
        return monday.format(DAY) + "–" + monday.plusDays(6).format(DAY);
    }

    private ZonedDateTime now() {
        return ZonedDateTime.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
    }

    /** Whether next week's schedule was sent, per Block of the selection that has Staff. */
    @Transactional(readOnly = true)
    public NextWeek nextWeek(String block) {
        currentUser.require(Permission.MANAGE_BLOCK);
        BlockSelection selection = blockScope.resolve(block);
        return status(selection.ids(), nextMonday(now()));
    }

    /** Whether the week starting {@code monday} was sent, per Block among {@code buildingIds} that has Staff. */
    private NextWeek status(Set<Long> buildingIds, LocalDate monday) {
        Map<Long, String> codes = blocks.codesByIds(staffBlocks(buildingIds));
        Map<Long, Object[]> sent = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT s.building_id, s.sent_at, u.display_name FROM auth_schedule_send s
                JOIN auth_user u ON u.id = s.sent_by WHERE s.week_start = :w
                """).param("w", Date.valueOf(monday))
                .query((rs, i) -> sent.put(rs.getLong("building_id"),
                        new Object[] { rs.getTimestamp("sent_at").toInstant(), rs.getString("display_name") }))
                .list();
        List<String> done = new ArrayList<>();
        List<String> pending = new ArrayList<>();
        Instant last = null;
        String by = null;
        for (Map.Entry<Long, String> e : codes.entrySet()) {
            Object[] s = sent.get(e.getKey());
            if (s == null) {
                pending.add(e.getValue());
                continue;
            }
            done.add(e.getValue());
            if (last == null || ((Instant) s[0]).isAfter(last)) {
                last = (Instant) s[0];
                by = (String) s[1];
            }
        }
        return new NextWeek(monday, monday.plusDays(6), done, pending, last, by,
                parameters.intValue("workload.schedule_reminder_day"), parameters.intValue("workload.schedule_reminder_hour"));
    }

    /** Sends next week's schedule to every Staff member of the selected Blocks; sending again sends it again. */
    @Transactional
    public Sent send(String block) {
        AuthenticatedUser manager = currentUser.require(Permission.MANAGE_BLOCK);
        BlockSelection selection = blockScope.resolve(block);
        LocalDate monday = nextMonday(now());
        Set<Long> buildingIds = staffBlocks(selection.ids());
        Instant at = Instant.now(clock);
        for (long b : buildingIds) {
            jdbc.sql("""
                    INSERT INTO auth_schedule_send (week_start, building_id, sent_at, sent_by) VALUES (:w, :b, :at, :by)
                    ON CONFLICT (week_start, building_id) DO UPDATE SET sent_at = EXCLUDED.sent_at, sent_by = EXCLUDED.sent_by
                    """).param("w", Date.valueOf(monday)).param("b", b).param("at", Timestamp.from(at))
                    .param("by", manager.userId()).update();
        }
        List<Person> staff = buildingIds.isEmpty() ? List.of() : jdbc.sql("""
                SELECT DISTINCT u.id, u.locale FROM auth_user u JOIN auth_user_block b ON b.user_id = u.id
                WHERE u.role = 'STAFF' AND u.status = 'ACTIVE' AND b.building_id IN (:b)
                """).param("b", List.copyOf(buildingIds))
                .query((rs, i) -> new Person(rs.getLong("id"), rs.getString("locale"))).list();
        Map<Long, List<StaffShifts.Shift>> all = shifts.forWeek(staff.stream().map(Person::id).toList(), monday);
        String week = weekText(monday);
        for (Person p : staff) {
            events.publishEvent(new WeekScheduleSent(p.id(), week,
                    shiftText(all.getOrDefault(p.id(), List.of()), "vi".equalsIgnoreCase(p.locale())), manager.name()));
        }
        List<String> codes = List.copyOf(blocks.codesByIds(buildingIds).values());
        audit.record("WEEK_SCHEDULE_SENT", AuditLog.Tone.INFO, "Week", week, week,
                Map.of("blocks", String.join(", ", codes), "staff", staff.size()));
        return new Sent(monday, staff.size(), codes);
    }

    /** Every hour: on the reminder day from its hour, reminds the Managers once while a Block's schedule is not sent. */
    @Scheduled(cron = "0 5 * * * *", zone = "Asia/Ho_Chi_Minh")
    @Transactional
    public void remindJob() {
        remind(now());
    }

    /** The reminder at {@code at}; returns whether the Managers were reminded. */
    @Transactional
    public boolean remind(ZonedDateTime at) {
        int day = parameters.intValue("workload.schedule_reminder_day");
        if (day < 1 || day > 7 || at.getDayOfWeek().getValue() != day
                || at.getHour() < parameters.intValue("workload.schedule_reminder_hour")) {
            return false;
        }
        LocalDate monday = nextMonday(at);
        boolean reminded = jdbc.sql("""
                SELECT count(*) FROM auth_schedule_week WHERE week_start = :w AND reminded_at IS NOT NULL
                """).param("w", Date.valueOf(monday)).query(Long.class).single() > 0;
        if (reminded) {
            return false;
        }
        Set<Long> withStaff = staffBlocks(blocks.allActiveIds());
        Set<Long> sent = Set.copyOf(jdbc.sql("SELECT building_id FROM auth_schedule_send WHERE week_start = :w")
                .param("w", Date.valueOf(monday)).query(Long.class).list());
        List<Long> pending = withStaff.stream().filter(b -> !sent.contains(b)).toList();
        if (pending.isEmpty()) {
            return false;
        }
        List<Long> managers = jdbc.sql("SELECT id FROM auth_user WHERE role = 'MANAGER' AND status = 'ACTIVE' ORDER BY id")
                .query(Long.class).list();
        jdbc.sql("""
                INSERT INTO auth_schedule_week (week_start, reminded_at) VALUES (:w, :at)
                ON CONFLICT (week_start) DO UPDATE SET reminded_at = EXCLUDED.reminded_at
                """).param("w", Date.valueOf(monday)).param("at", Timestamp.from(at.toInstant())).update();
        events.publishEvent(new WeekScheduleReminderDue(managers, weekText(monday),
                String.join(", ", blocks.codesByIds(pending).values())));
        log.info("Reminded {} Managers to send the schedule of the week of {}", managers.size(), monday);
        return true;
    }

    // ---------------------------------------------------------------- planning one week

    /** How many weeks ahead a Manager may plan, and look back. */
    static final int WEEKS_AHEAD = 4;
    static final int WEEKS_BACK = 4;

    /** One Staff member's row of the plan; {@code planned} false = the week uses the default weekly shifts. */
    public record PlanRow(String id, String name, String title, List<String> blocks, List<StaffShifts.Shift> shifts,
            boolean planned) {
    }

    /**
     * A week of the Staff schedule; {@code editable} for this week and later; {@code sent*} and {@code pendingBlocks}
     * say whether the week's schedule was sent to the Staff.
     */
    public record Plan(LocalDate start, LocalDate end, boolean editable, boolean nextWeek, List<PlanRow> staff,
            List<String> sentBlocks, List<String> pendingBlocks, Instant sentAt, String sentBy, int reminderDay,
            int reminderHour) {
    }

    /** The Staff member's own schedule: this week, and next week once it was sent. */
    public record Mine(Week thisWeek, Week nextWeek, boolean inShift, String shiftToday) {
    }

    /** {@code shifts} null while the week was not sent. */
    public record Week(LocalDate start, LocalDate end, boolean sent, List<StaffShifts.Shift> shifts) {
    }

    private LocalDate week(LocalDate wanted, boolean edit) {
        LocalDate thisMonday = StaffShifts.mondayOf(now().toLocalDate());
        LocalDate monday = wanted == null ? thisMonday.plusWeeks(1) : StaffShifts.mondayOf(wanted);
        if (monday.isAfter(thisMonday.plusWeeks(WEEKS_AHEAD)) || monday.isBefore(thisMonday.minusWeeks(WEEKS_BACK))) {
            throw FieldErrors.single("week", "Choose a week from 4 weeks ago to 4 weeks ahead.");
        }
        if (edit && monday.isBefore(thisMonday)) {
            throw FieldErrors.single("week", "A past week can no longer be changed.");
        }
        return monday;
    }

    /** The schedule of the week holding {@code wanted} (default: next week) for the Staff of the selected Blocks. */
    @Transactional(readOnly = true)
    public Plan plan(String block, LocalDate wanted) {
        currentUser.require(Permission.MANAGE_BLOCK);
        BlockSelection selection = blockScope.resolve(block);
        LocalDate monday = week(wanted, false);
        LocalDate thisMonday = StaffShifts.mondayOf(now().toLocalDate());
        List<StaffRow> people = selection.ids().isEmpty() ? List.of() : jdbc.sql("""
                SELECT DISTINCT u.id, u.display_name, u.title FROM auth_user u JOIN auth_user_block b ON b.user_id = u.id
                WHERE u.role = 'STAFF' AND u.status = 'ACTIVE' AND b.building_id IN (:b) ORDER BY u.display_name, u.id
                """).param("b", List.copyOf(selection.ids()))
                .query((rs, i) -> new StaffRow(rs.getLong("id"), rs.getString("display_name"), rs.getString("title")))
                .list();
        List<Long> ids = people.stream().map(StaffRow::id).toList();
        Map<Long, List<StaffShifts.Shift>> week = shifts.forWeek(ids, monday);
        Set<Long> planned = shifts.planned(ids, monday);
        Map<Long, List<Long>> buildingsOf = new LinkedHashMap<>();
        if (!ids.isEmpty()) {
            jdbc.sql("SELECT user_id, building_id FROM auth_user_block WHERE user_id IN (:ids)").param("ids", ids)
                    .query((rs, i) -> buildingsOf.computeIfAbsent(rs.getLong("user_id"), k -> new ArrayList<>())
                            .add(rs.getLong("building_id")))
                    .list();
        }
        Map<Long, String> codes = blocks.codesByIds(buildingsOf.values().stream().flatMap(List::stream).toList());
        List<PlanRow> rows = people.stream().map(p -> new PlanRow(String.valueOf(p.id()), p.name(), p.title(),
                buildingsOf.getOrDefault(p.id(), List.of()).stream().map(b -> codes.getOrDefault(b, "")).sorted().toList(),
                week.getOrDefault(p.id(), List.of()), planned.contains(p.id()))).toList();
        NextWeek status = status(selection.ids(), monday);
        return new Plan(monday, monday.plusDays(6), !monday.isBefore(thisMonday), monday.equals(thisMonday.plusWeeks(1)),
                rows, status.sentBlocks(), status.pendingBlocks(), status.sentAt(), status.sentBy(), status.reminderDay(),
                status.reminderHour());
    }

    private record StaffRow(long id, String name, String title) {
    }

    /** Plans one Staff member's week (an empty list is a week off); the default weekly shifts stay as they are. */
    @Transactional
    public List<StaffShifts.Shift> setWeek(String staffId, LocalDate wanted, List<StaffShifts.Shift> list) {
        AuthenticatedUser manager = currentUser.require(Permission.MANAGE_BLOCK);
        LocalDate monday = week(wanted, true);
        long id = staffOf(staffId);
        List<StaffShifts.Shift> clean = StaffShifts.clean(list);
        List<StaffShifts.Shift> before = shifts.forWeek(List.of(id), monday).getOrDefault(id, List.of());
        shifts.replaceWeek(id, monday, clean, manager.userId());
        List<StaffShifts.Shift> after = shifts.forWeek(List.of(id), monday).getOrDefault(id, List.of());
        audit.record("STAFF_WEEK_PLANNED", AuditLog.Tone.INFO, "User", id, nameOf(id), Map.of("week", weekText(monday),
                "shifts", java.util.Arrays.asList(StaffShifts.text(before), StaffShifts.text(after))));
        return after;
    }

    /** Drops the plan of one Staff member's week: it follows the default weekly shifts again. */
    @Transactional
    public List<StaffShifts.Shift> resetWeek(String staffId, LocalDate wanted) {
        currentUser.require(Permission.MANAGE_BLOCK);
        LocalDate monday = week(wanted, true);
        long id = staffOf(staffId);
        shifts.resetWeek(id, monday);
        audit.record("STAFF_WEEK_RESET", AuditLog.Tone.INFO, "User", id, nameOf(id), Map.of("week", weekText(monday)));
        return shifts.forWeek(List.of(id), monday).getOrDefault(id, List.of());
    }

    /** The signed-in Staff member's schedule: this week, and next week once a Manager sent it to one of their Blocks. */
    @Transactional(readOnly = true)
    public Mine mine() {
        AuthenticatedUser user = currentUser.require(Role.STAFF);
        LocalDate thisMonday = StaffShifts.mondayOf(now().toLocalDate());
        LocalDate next = thisMonday.plusWeeks(1);
        boolean sent = jdbc.sql("""
                SELECT count(*) FROM auth_schedule_send s JOIN auth_user_block b ON b.building_id = s.building_id
                WHERE s.week_start = :w AND b.user_id = :u
                """).param("w", Date.valueOf(next)).param("u", user.userId()).query(Long.class).single() > 0;
        long me = user.userId();
        List<StaffShifts.Shift> current = shifts.forWeek(List.of(me), thisMonday).getOrDefault(me, List.of());
        List<StaffShifts.Shift> coming = sent ? shifts.forWeek(List.of(me), next).getOrDefault(me, List.of()) : null;
        StaffShifts.Now now = shifts.nowOf(me);
        return new Mine(new Week(thisMonday, thisMonday.plusDays(6), true, current),
                new Week(next, next.plusDays(6), sent, coming), now.inShift(), now.today());
    }

    /** An active Staff member who shares a Block with the Manager; anyone else answers 404. */
    private long staffOf(String staffId) {
        Set<Long> mine = currentUser.get().blockIds();
        String v = staffId == null ? "" : staffId.trim();
        if (v.isEmpty() || v.length() > 18 || !v.chars().allMatch(Character::isDigit) || mine.isEmpty()) {
            throw ApiException.notFound("This staff member does not exist.");
        }
        return jdbc.sql("""
                SELECT u.id FROM auth_user u WHERE u.id = :id AND u.role = 'STAFF' AND u.status = 'ACTIVE'
                  AND EXISTS (SELECT 1 FROM auth_user_block b WHERE b.user_id = u.id AND b.building_id IN (:mine))
                """).param("id", Long.parseLong(v)).param("mine", List.copyOf(mine)).query(Long.class).optional()
                .orElseThrow(() -> ApiException.notFound("This staff member does not exist."));
    }

    private String nameOf(long id) {
        return jdbc.sql("SELECT display_name FROM auth_user WHERE id = :id").param("id", id).query(String.class).single();
    }

    /** The Blocks among {@code ids} that have at least one active Staff member. */
    private Set<Long> staffBlocks(Set<Long> ids) {
        if (ids.isEmpty()) {
            return Set.of();
        }
        return new LinkedHashSet<>(jdbc.sql("""
                SELECT DISTINCT b.building_id FROM auth_user_block b JOIN auth_user u ON u.id = b.user_id
                WHERE u.role = 'STAFF' AND u.status = 'ACTIVE' AND b.building_id IN (:ids) ORDER BY b.building_id
                """).param("ids", List.copyOf(ids)).query(Long.class).list());
    }

    /** "T2 07:00–15:00, T3 07:00–15:00" (or Mon …), or a word for no shift. */
    static String shiftText(List<StaffShifts.Shift> list, boolean vi) {
        if (list.isEmpty()) {
            return vi ? "chưa có ca" : "no shift";
        }
        String[] days = vi ? DAYS_VI : DAYS_EN;
        return String.join(", ", list.stream().map(s -> days[s.weekday() - 1] + " " + s.start() + "–" + s.end()).toList());
    }
}
