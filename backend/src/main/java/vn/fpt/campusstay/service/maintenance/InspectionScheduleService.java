package vn.fpt.campusstay.service.maintenance;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.event.InspectionScheduled;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.config.TimeConfig;

/**
 * Block Manager › Inspection schedule. A schedule starts its first run when it is
 * created and the next ones at 06:00 on their day ({@link InspectionJob}); each run
 * keeps the checklist version published when it started and the Rooms in scope then.
 */
@Service
public class InspectionScheduleService {

    public record Option(String value, String label) {
    }

    public record Options(List<Option> checklists, List<Option> scopes, List<Option> repeats, List<Option> assignees) {
    }

    /** @param scope and {@code repeat} are option values; {@code assignee} a user id; {@code status} Active or Paused */
    public record ScheduleItem(String id, String name, String checklistId, String scope, String scopeLabel,
            String repeat, String repeatLabel, String assignee, int dueWithinDays, boolean createRequests,
            boolean notifyResidents, Instant nextRunAt, String status, Instant createdAt) {
    }

    /** @param status Planned, In progress or Done */
    public record RunItem(String id, String assigneeName, int inspected, int rooms, int failed, String status) {
    }

    public record Page(List<ScheduleItem> items, List<RunItem> runs, Options options) {
    }

    public record Created(String id) {
    }

    record Schedule(long id, long buildingId, String name, String family, String scope, Set<Integer> floors,
            String repeat, Long assigneeId, int dueWithinDays, boolean createRequests, boolean notifyResidents,
            Instant nextRunAt, String status, Instant createdAt) {

        /** The floor of a {@code FLOORS} scope, else null. */
        Integer floor() {
            return floors.isEmpty() ? null : floors.iterator().next();
        }

        /** The option value of the scope: {@code ALL_ROOMS}, {@code OCCUPIED}, {@code EMPTY} or {@code FLOOR_3}. */
        String scopeValue() {
            return scope.equals("FLOORS") ? "FLOOR_" + floor() : scope;
        }
    }

    private static final Map<String, String> SCOPES = new LinkedHashMap<>();
    private static final Map<String, String> REPEATS = new LinkedHashMap<>();
    static final Map<String, String> RUN_STATUSES = Map.of("SCHEDULED", "Planned", "IN_PROGRESS", "In progress",
            "SUBMITTED", "Done");
    /** Runs start at this hour, campus time. */
    static final int START_HOUR = 6;
    private static final int MAX_DUE_DAYS = 60;
    private static final int RECENT_RUNS = 20;

    static {
        SCOPES.put("ALL_ROOMS", "All Rooms");
        SCOPES.put("OCCUPIED", "Occupied Rooms");
        SCOPES.put("EMPTY", "Empty Rooms");
        REPEATS.put("ONCE", "Once");
        REPEATS.put("WEEKLY", "Every week");
        REPEATS.put("MONTHLY", "Every month");
        REPEATS.put("TERMLY", "Once a Term");
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final UserDirectory users;
    private final Inventory inventory;
    private final Residences residences;
    private final TermCatalog terms;
    private final ChecklistService checklists;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public InspectionScheduleService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope,
            UserDirectory users, Inventory inventory, Residences residences, TermCatalog terms,
            ChecklistService checklists, ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.users = users;
        this.inventory = inventory;
        this.residences = residences;
        this.terms = terms;
        this.checklists = checklists;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- screen

    @Transactional(readOnly = true)
    public Page list(String block) {
        currentUser.require(Permission.MANAGE_BLOCK);
        long building = building(block);
        List<Schedule> schedules = jdbc.sql("SELECT * FROM mnt_inspection_schedule WHERE building_id = :b ORDER BY name, id")
                .param("b", building).query(InspectionScheduleService::schedule).list();
        record Run(long id, Long inspectorId, String status, int rooms, int inspected, int failed) {
        }
        List<Run> recent = jdbc.sql("""
                SELECT r.id, r.inspector_id, r.status,
                       (SELECT count(*) FROM mnt_inspection_room x WHERE x.run_id = r.id) AS rooms,
                       (SELECT count(*) FROM mnt_inspection_room x WHERE x.run_id = r.id AND x.status = 'INSPECTED')
                           AS inspected,
                       (SELECT count(*) FROM mnt_inspection_result s JOIN mnt_inspection_room x
                               ON x.id = s.inspection_room_id WHERE x.run_id = r.id AND s.result = 'FAIL') AS failed
                FROM mnt_inspection_run r WHERE r.building_id = :b
                ORDER BY r.run_date DESC, r.id DESC LIMIT :limit
                """).param("b", building).param("limit", RECENT_RUNS)
                .query((rs, i) -> new Run(rs.getLong("id"), rs.getObject("inspector_id", Long.class),
                        rs.getString("status"), rs.getInt("rooms"), rs.getInt("inspected"), rs.getInt("failed")))
                .list();
        Map<Long, String> inspectors = users.displayNames(recent.stream().map(Run::inspectorId)
                .filter(Objects::nonNull).collect(Collectors.toSet()));
        List<RunItem> runs = recent.stream().map(r -> new RunItem(code(r.id()),
                r.inspectorId() == null ? null : inspectors.get(r.inspectorId()), r.inspected(), r.rooms(), r.failed(),
                RUN_STATUSES.get(r.status()))).toList();
        return new Page(schedules.stream().map(s -> new ScheduleItem(String.valueOf(s.id()), s.name(), s.family(),
                s.scopeValue(), scopeLabel(s.scope(), s.floor()), s.repeat(), REPEATS.get(s.repeat()),
                s.assigneeId() == null ? null : String.valueOf(s.assigneeId()), s.dueWithinDays(), s.createRequests(),
                s.notifyResidents(), s.nextRunAt(), s.status().equals("ACTIVE") ? "Active" : "Paused", s.createdAt()))
                .toList(), runs, options(building));
    }

    // ---------------------------------------------------------------- changes

    /**
     * {@code block, name, checklistId, scope, repeat, assignee, dueWithinDays, createRequests, notifyResidents};
     * the first run starts now.
     */
    @Transactional
    public Created create(Map<String, Object> body) {
        currentUser.require(Permission.MANAGE_BLOCK);
        long building = building(text(body.get("block")));
        FieldErrors errors = new FieldErrors();
        String name = text(body.get("name"));
        errors.check(!name.isEmpty() && name.length() <= 150, "name", "Enter a name of at most 150 characters.");
        String family = checklist(errors, body.get("checklistId"));
        String[] scope = scope(errors, building, body.get("scope"));
        String repeat = repeat(errors, body.get("repeat"));
        Long assignee = assignee(errors, building, body.get("assignee"));
        Integer due = dueDays(errors, body.get("dueWithinDays"));
        errors.throwIfAny();
        Instant now = Instant.now(clock);
        long id = jdbc.sql("""
                INSERT INTO mnt_inspection_schedule (building_id, name, checklist_family, scope, floors, repeat,
                                                     assignee_id, due_within_days, create_requests, notify_residents,
                                                     next_run_at, created_at)
                VALUES (:b, :name, :family, :scope, :floors, :repeat, :assignee, :due, :requests, :notify, :now, :now)
                RETURNING id
                """)
                .param("b", building).param("name", name).param("family", family).param("scope", scope[0])
                .param("floors", scope[1] == null ? null : new Integer[] { Integer.valueOf(scope[1]) })
                .param("repeat", repeat).param("assignee", assignee).param("due", due)
                .param("requests", !Boolean.FALSE.equals(body.get("createRequests")))
                .param("notify", !Boolean.FALSE.equals(body.get("notifyResidents"))).param("now", Timestamp.from(now))
                .query(Long.class).single();
        audit.record("INSPECTION_SCHEDULE_CREATED", AuditLog.Tone.INFO, "Inspection schedule", id, name, null);
        start(find(id, true), now);
        return new Created(String.valueOf(id));
    }

    /** Only the fields sent change; {@code status} Active or Paused. */
    @Transactional
    public void update(String id, Map<String, Object> body) {
        currentUser.require(Permission.MANAGE_BLOCK);
        Schedule s = parse(id).map(n -> find(n, true)).orElseThrow(InspectionScheduleService::notFound);
        blockScope.check(s.buildingId());
        FieldErrors errors = new FieldErrors();
        String name = body.containsKey("name") ? text(body.get("name")) : s.name();
        errors.check(!name.isEmpty() && name.length() <= 150, "name", "Enter a name of at most 150 characters.");
        String family = body.containsKey("checklistId") ? checklist(errors, body.get("checklistId")) : s.family();
        String[] scope = body.containsKey("scope") ? scope(errors, s.buildingId(), body.get("scope"))
                : new String[] { s.scope(), s.floor() == null ? null : String.valueOf(s.floor()) };
        String repeat = body.containsKey("repeat") ? repeat(errors, body.get("repeat")) : s.repeat();
        Long assignee = body.containsKey("assignee") ? assignee(errors, s.buildingId(), body.get("assignee"))
                : s.assigneeId();
        Integer due = body.containsKey("dueWithinDays") ? dueDays(errors, body.get("dueWithinDays")) : s.dueWithinDays();
        String status = s.status();
        if (body.containsKey("status")) {
            String value = text(body.get("status"));
            status = value.equalsIgnoreCase("Active") ? "ACTIVE" : value.equalsIgnoreCase("Paused") ? "PAUSED" : null;
            errors.check(status != null, "status", "Choose Active or Paused.");
        }
        errors.throwIfAny();
        if (status.equals("ACTIVE") && !s.status().equals("ACTIVE") && checklists.published(family).isEmpty()) {
            throw ApiException.conflict("CHECKLIST_NOT_PUBLISHED", "The checklist of this schedule is not published.");
        }
        jdbc.sql("""
                UPDATE mnt_inspection_schedule SET name = :name, checklist_family = :family, scope = :scope,
                       floors = :floors, repeat = :repeat, assignee_id = :assignee, due_within_days = :due,
                       create_requests = :requests, notify_residents = :notify, status = :status, version = version + 1
                WHERE id = :id
                """)
                .param("name", name).param("family", family).param("scope", scope[0])
                .param("floors", scope[1] == null ? null : new Integer[] { Integer.valueOf(scope[1]) })
                .param("repeat", repeat).param("assignee", assignee).param("due", due)
                .param("requests", body.containsKey("createRequests") ? !Boolean.FALSE.equals(body.get("createRequests"))
                        : s.createRequests())
                .param("notify", body.containsKey("notifyResidents") ? !Boolean.FALSE.equals(body.get("notifyResidents"))
                        : s.notifyResidents())
                .param("status", status).param("id", s.id()).update();
        audit.record("INSPECTION_SCHEDULE_UPDATED", AuditLog.Tone.INFO, "Inspection schedule", s.id(), name,
                Map.of("status", status.equals("ACTIVE") ? "Active" : "Paused"));
    }

    // ---------------------------------------------------------------- runs

    /** Starts the runs of active schedules that are due; returns how many started. */
    @Transactional
    public int startDue() {
        Instant now = Instant.now(clock);
        List<Schedule> due = jdbc.sql("""
                SELECT * FROM mnt_inspection_schedule WHERE status = 'ACTIVE' AND next_run_at <= :now
                ORDER BY next_run_at, id FOR UPDATE SKIP LOCKED
                """).param("now", Timestamp.from(now)).query(InspectionScheduleService::schedule).list();
        int started = 0;
        for (Schedule s : due) {
            started += start(s, now) ? 1 : 0;
        }
        return started;
    }

    /**
     * One run of the schedule today with the Rooms in scope, then the next run time. Without a published
     * checklist nothing starts and the schedule waits; a scope without Rooms only moves the next run time.
     */
    private boolean start(Schedule s, Instant now) {
        Optional<ChecklistService.Version> checklist = checklists.published(s.family());
        if (checklist.isEmpty()) {
            return false;
        }
        LocalDate today = LocalDate.ofInstant(now, TimeConfig.CAMPUS_ZONE);
        List<Inventory.BedSlot> beds = inventory.bedsOfBuilding(s.buildingId());
        Map<Long, Long> occupied = residences.residentsOfBeds(beds.stream().map(Inventory.BedSlot::bedId).toList());
        Map<Long, List<Inventory.BedSlot>> rooms = beds.stream()
                .collect(Collectors.groupingBy(Inventory.BedSlot::roomId, LinkedHashMap::new, Collectors.toList()));
        List<Long> inScope = new ArrayList<>();
        List<Long> students = new ArrayList<>();
        rooms.forEach((room, roomBeds) -> {
            List<Long> residents = roomBeds.stream().map(b -> occupied.get(b.bedId())).filter(Objects::nonNull).toList();
            boolean take = switch (s.scope()) {
                case "OCCUPIED" -> !residents.isEmpty();
                case "EMPTY" -> residents.isEmpty();
                case "FLOORS" -> s.floors().contains(roomBeds.getFirst().floor());
                default -> true;
            };
            if (take) {
                inScope.add(room);
                students.addAll(residents);
            }
        });
        boolean started = false;
        if (!inScope.isEmpty()) {
            Instant dueAt = today.plusDays(s.dueWithinDays() + 1L).atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant();
            long run = jdbc.sql("""
                    INSERT INTO mnt_inspection_run (schedule_id, building_id, checklist_id, run_date, due_at, inspector_id,
                                                    created_at)
                    VALUES (:s, :b, :c, :day, :due, :inspector, :now) RETURNING id
                    """)
                    .param("s", s.id()).param("b", s.buildingId()).param("c", checklist.get().id()).param("day", today)
                    .param("due", Timestamp.from(dueAt)).param("inspector", s.assigneeId())
                    .param("now", Timestamp.from(now)).query(Long.class).single();
            for (long room : inScope) {
                jdbc.sql("INSERT INTO mnt_inspection_room (run_id, room_id) VALUES (:run, :room)")
                        .param("run", run).param("room", room).update();
            }
            if (s.notifyResidents() && !students.isEmpty()) {
                events.publishEvent(new InspectionScheduled(run, code(run), List.copyOf(students), today, dueAt));
            }
            started = true;
        }
        jdbc.sql("UPDATE mnt_inspection_schedule SET next_run_at = :next WHERE id = :id")
                .param("next", next(s, today).map(Timestamp::from).orElse(null)).param("id", s.id()).update();
        return started;
    }

    /** 06:00 on the next day of the schedule, or none for a one-off schedule (or no later Term). */
    private Optional<Instant> next(Schedule s, LocalDate today) {
        Optional<LocalDate> day = switch (s.repeat()) {
            case "WEEKLY" -> Optional.of(today.plusWeeks(1));
            case "MONTHLY" -> Optional.of(today.plusMonths(1));
            case "TERMLY" -> terms.publishedTerms().stream().map(TermSummary::stayStart)
                    .filter(d -> d != null && d.isAfter(today)).min(LocalDate::compareTo);
            default -> Optional.empty();
        };
        return day.map(d -> d.atTime(START_HOUR, 0).atZone(TimeConfig.CAMPUS_ZONE).toInstant());
    }

    // ---------------------------------------------------------------- helpers

    private Options options(long building) {
        List<Option> scopes = new ArrayList<>();
        SCOPES.forEach((value, label) -> scopes.add(new Option(value, label)));
        new TreeSet<>(inventory.bedsOfBuilding(building).stream().map(Inventory.BedSlot::floor).toList())
                .forEach(f -> scopes.add(new Option("FLOOR_" + f, "Floor " + f)));
        List<Option> repeats = new ArrayList<>();
        REPEATS.forEach((value, label) -> repeats.add(new Option(value, label)));
        return new Options(
                checklists.publishedAll().stream()
                        .map(c -> new Option(c.family(), c.name() + " · v" + c.version())).toList(),
                scopes, repeats,
                users.staffOf(List.of(building)).stream()
                        .map(m -> new Option(String.valueOf(m.userId()), m.name())).toList());
    }

    /** {@code All Rooms}, {@code Floor 3} …: how screens show a scope. */
    static String scopeLabel(String scope, Integer floor) {
        return scope.equals("FLOORS") ? "Floor " + floor : SCOPES.getOrDefault(scope, SCOPES.get("ALL_ROOMS"));
    }

    private String checklist(FieldErrors errors, Object value) {
        String family = text(value);
        boolean ok = !family.isEmpty() && checklists.published(family).isPresent();
        errors.check(ok, "checklistId", "Choose a published checklist.");
        return ok ? checklists.published(family).get().family() : null;
    }

    /** {@code [scope, floor]}; the floor is set for {@code FLOOR_n}. */
    private String[] scope(FieldErrors errors, long building, Object value) {
        String text = text(value).toUpperCase(Locale.ROOT);
        if (SCOPES.containsKey(text)) {
            return new String[] { text, null };
        }
        Set<Integer> floors = inventory.bedsOfBuilding(building).stream().map(Inventory.BedSlot::floor)
                .collect(Collectors.toSet());
        if (text.startsWith("FLOOR_") && parse(text.substring(6)).map(Long::intValue).filter(floors::contains).isPresent()) {
            return new String[] { "FLOORS", text.substring(6) };
        }
        errors.add("scope", "Choose a scope from the list.");
        return new String[] { null, null };
    }

    private static String repeat(FieldErrors errors, Object value) {
        String text = text(value).toUpperCase(Locale.ROOT);
        errors.check(REPEATS.containsKey(text), "repeat", "Choose how often it repeats.");
        return text;
    }

    private Long assignee(FieldErrors errors, long building, Object value) {
        Long id = parse(text(value)).orElse(null);
        boolean ok = id != null && users.staffOf(List.of(building)).stream().anyMatch(m -> m.userId() == id);
        errors.check(ok, "assignee", "Choose someone from this Block's staff.");
        return id;
    }

    private static Integer dueDays(FieldErrors errors, Object value) {
        Integer days = parse(text(value)).map(Long::intValue).orElse(null);
        errors.check(days != null && days >= 1 && days <= MAX_DUE_DAYS, "dueWithinDays",
                "Enter 1 to " + MAX_DUE_DAYS + " days.");
        return days;
    }

    private long building(String block) {
        BlockSelection selection = blockScope.resolve(block);
        if (!selection.single()) {
            throw FieldErrors.single("block", "Choose a Block.");
        }
        return selection.singleId();
    }

    private Schedule find(long id, boolean lock) {
        return jdbc.sql("SELECT * FROM mnt_inspection_schedule WHERE id = :id" + (lock ? " FOR UPDATE" : ""))
                .param("id", id).query(InspectionScheduleService::schedule).optional()
                .orElseThrow(InspectionScheduleService::notFound);
    }

    private static ApiException notFound() {
        return ApiException.notFound("This inspection schedule does not exist.");
    }

    /** {@code INS-12}: how screens show a run. */
    static String code(long runId) {
        return "INS-" + runId;
    }

    static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    static Optional<Long> parse(String value) {
        if (value == null || value.isBlank() || value.length() > 18 || !value.chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(value));
    }

    private static Schedule schedule(ResultSet rs, int i) throws SQLException {
        Array floors = rs.getArray("floors");
        Set<Integer> floorSet = new TreeSet<>();
        if (floors != null) {
            for (Object f : (Object[]) floors.getArray()) {
                floorSet.add(((Number) f).intValue());
            }
        }
        Timestamp next = rs.getTimestamp("next_run_at");
        return new Schedule(rs.getLong("id"), rs.getLong("building_id"), rs.getString("name"),
                rs.getString("checklist_family"), rs.getString("scope"), floorSet, rs.getString("repeat"),
                rs.getObject("assignee_id", Long.class), rs.getInt("due_within_days"), rs.getBoolean("create_requests"),
                rs.getBoolean("notify_residents"), next == null ? null : next.toInstant(), rs.getString("status"),
                rs.getTimestamp("created_at").toInstant());
    }
}
