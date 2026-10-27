package vn.fpt.campusstay.service.maintenance;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.event.FurnitureRepairLogged;
import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.event.MaintenanceReported;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.repository.maintenance.RequestStore;

/**
 * Staff › Inspections: the run of the day, Room by Room. A failed item creates a
 * Maintenance Request in the item's category (when the schedule asks for it), with
 * the priority its severity sets, and routing rules assign it like any new request.
 * Each Room also has its own checks (spec §6.19): the number of people matches the
 * residents, and every furniture item in it; a failed item's request names the item.
 */
@Service
public class InspectionRunService {

    public record ChecklistView(String name, String version, List<ChecklistService.Item> items) {
    }

    public record RunView(String id, LocalDate date, Instant dueAt, String scheduleName, String scope, int rooms,
            int inspected, int failed, int unreachable, String inspectorName, ChecklistView checklist) {
    }

    public record Current(RunView run) {
    }

    /** @param result Pass, Fail or Not checked */
    public record Result(String itemId, String result, String note) {
    }

    /**
     * A check of the Room itself, answered like a checklist item ({@link Result#itemId()} = {@code id}).
     *
     * @param id       {@code people}, or {@code furniture-<item id>}
     * @param kind     {@code people} or {@code furniture}
     * @param expected for {@code people}: the residents the Room has now
     */
    public record RoomCheck(String id, String kind, Integer expected, String assetCode, String type, String typeVi) {
    }

    /**
     * @param status To do, In progress, Done or Not reachable
     * @param checks the Room's own checks; their answers are in {@code results} too
     */
    public record RoomItem(String room, String roomTypeName, String roomClassName, String status, List<Result> results,
            List<RoomCheck> checks) {
    }

    public record RoomsPage(List<RoomItem> items, long total) {
    }

    public record Saved(List<String> createdRequests) {
    }

    public record Upcoming(String id, LocalDate date, String scope, String scheduleName) {
    }

    public record UpcomingPage(List<Upcoming> items) {
    }

    private record Run(long id, Long scheduleId, long buildingId, long checklistId, LocalDate date, Instant dueAt,
            Long inspectorId, String status) {
    }

    private record RoomRow(long id, long roomId, String status) {
    }

    private record Stored(long itemId, String result, String note, Long requestId) {
    }

    private record NewRequest(long id, String code) {
    }

    private record Choice(String result, String note) {
    }

    private static final Map<String, String> RESULTS = Map.of("PASS", "Pass", "FAIL", "Fail", "NOT_CHECKED", "Not checked");
    /** Priority of the Maintenance Request a failed item creates, by the item's severity. */
    private static final Map<String, String> PRIORITY = Map.of("CRITICAL", "HIGH", "MAJOR", "MEDIUM", "MINOR", "LOW",
            "TRIVIAL", "LOW");
    private static final int NOTE_MAX = 500;

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final UserDirectory users;
    private final Inventory inventory;
    private final Catalog catalog;
    private final TermCatalog terms;
    private final Residences residences;
    private final ChecklistService checklists;
    private final RequestStore requests;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public InspectionRunService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, UserDirectory users,
            Inventory inventory, Catalog catalog, TermCatalog terms, Residences residences, ChecklistService checklists,
            RequestStore requests, ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.users = users;
        this.inventory = inventory;
        this.catalog = catalog;
        this.terms = terms;
        this.residences = residences;
        this.checklists = checklists;
        this.requests = requests;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * The oldest run started and not submitted in the Blocks, the user's own first; null when there is none.
     * Runs belong to a Block, not to a Term, so {@code termId} does not filter them.
     */
    @Transactional(readOnly = true)
    public Current current(String block) {
        AuthenticatedUser me = currentUser.require(Permission.PROCESS_MAINTENANCE);
        Set<Long> buildings = blockScope.resolve(block).ids();
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        Optional<Run> run = jdbc.sql("""
                SELECT * FROM mnt_inspection_run
                WHERE building_id IN (:b) AND status <> 'SUBMITTED' AND run_date <= :today
                ORDER BY (inspector_id = :me) DESC NULLS LAST, run_date, id LIMIT 1
                """).param("b", List.copyOf(buildings)).param("today", today).param("me", me.userId())
                .query((rs, i) -> run(rs)).optional();
        return new Current(run.map(this::view).orElse(null));
    }

    @Transactional(readOnly = true)
    public RoomsPage rooms(String id, PageQuery page) {
        currentUser.require(Permission.PROCESS_MAINTENANCE);
        Run run = run(id, false);
        Map<Long, Inventory.BedSlot> roomInfo = roomInfo(run.buildingId());
        List<RoomRow> rows = roomRows(run.id()).stream()
                .sorted(Comparator.comparing(r -> roomInfo.containsKey(r.roomId()) ? roomInfo.get(r.roomId()).roomCode() : ""))
                .toList();
        Map<Long, List<Stored>> results = results(rows.stream().map(RoomRow::id).toList());
        Map<Long, List<StoredCheck>> checkResults = checkResults(rows.stream().map(RoomRow::id).toList());
        Map<Long, String> types = catalog.roomTypes().stream()
                .collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name));
        Map<Long, String> classes = catalog.roomClasses().stream()
                .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name));
        List<RoomItem> items = rows.stream().skip(page.offset()).limit(page.limit()).map(r -> {
            Inventory.BedSlot info = roomInfo.get(r.roomId());
            List<Stored> stored = results.getOrDefault(r.id(), List.of());
            List<StoredCheck> answered = checkResults.getOrDefault(r.id(), List.of());
            List<Result> all = new ArrayList<>(stored.stream()
                    .map(s -> new Result(String.valueOf(s.itemId()), RESULTS.get(s.result()), s.note())).toList());
            answered.forEach(c -> all.add(new Result(checkId(c.key()), RESULTS.get(c.result()), c.note())));
            return new RoomItem(info == null ? null : info.roomCode(), info == null ? null : types.get(info.roomTypeId()),
                    info == null ? null : classes.get(info.roomClassId()),
                    status(r, stored.stream().anyMatch(s -> !s.result().equals("NOT_CHECKED"))
                            || answered.stream().anyMatch(c -> !c.result().equals("NOT_CHECKED"))),
                    all, checks(r.roomId()));
        }).toList();
        return new RoomsPage(items, rows.size());
    }

    /** Results of the Room's items; a Room is done once every item is Pass or Fail. */
    @Transactional
    public Saved saveRoom(String id, String roomCode, List<Result> input) {
        AuthenticatedUser me = currentUser.require(Permission.PROCESS_MAINTENANCE);
        Run run = run(id, true);
        open(run);
        RoomRow room = room(run, roomCode);
        if (!room.status().equals("PENDING")) {
            throw ApiException.conflict("ROOM_DONE", "This Room is already "
                    + (room.status().equals("INSPECTED") ? "inspected." : "marked not reachable."));
        }
        Map<Long, ChecklistService.VersionItem> items = new LinkedHashMap<>();
        checklists.items(List.of(run.checklistId())).getOrDefault(run.checklistId(), List.of())
                .forEach(i -> items.put(i.id(), i));
        Map<String, RoomCheck> checks = new LinkedHashMap<>();
        checks(room.roomId()).forEach(c -> checks.put(c.id(), c));
        Map<Long, Choice> chosen = new LinkedHashMap<>();
        Map<String, Choice> chosenChecks = new LinkedHashMap<>();
        for (Result r : input == null ? List.<Result>of() : input) {
            if (r != null && r.itemId() != null && checks.containsKey(r.itemId().trim())) {
                chosenChecks.put(r.itemId().trim(), choice(r));
                continue;
            }
            Long itemId = r == null ? null : InspectionScheduleService.parse(r.itemId()).orElse(null);
            String result = r == null || r.result() == null ? null : RESULTS.entrySet().stream()
                    .filter(e -> e.getValue().equalsIgnoreCase(r.result().trim()) || e.getKey().equalsIgnoreCase(r.result().trim()))
                    .map(Map.Entry::getKey).findFirst().orElse(null);
            if (itemId == null || !items.containsKey(itemId) || result == null) {
                throw FieldErrors.single("results", "Send Pass, Fail or Not checked for items of this checklist.");
            }
            String note = r.note() == null || r.note().isBlank() ? null : r.note().trim();
            if (note != null && note.length() > NOTE_MAX) {
                throw FieldErrors.single("results", "Keep each note under " + NOTE_MAX + " characters.");
            }
            chosen.put(itemId, new Choice(result, note));
        }
        Map<Long, Stored> before = results(List.of(room.id())).getOrDefault(room.id(), List.of()).stream()
                .collect(Collectors.toMap(Stored::itemId, s -> s));
        boolean createRequests = run.scheduleId() == null || jdbc.sql(
                "SELECT create_requests FROM mnt_inspection_schedule WHERE id = :id").param("id", run.scheduleId())
                .query(Boolean.class).optional().orElse(true);
        Inventory.BedSlot info = roomInfo(run.buildingId()).get(room.roomId());
        Instant now = Instant.now(clock);
        List<String> created = new ArrayList<>();
        for (Map.Entry<Long, Choice> e : chosen.entrySet()) {
            ChecklistService.VersionItem item = items.get(e.getKey());
            String result = e.getValue().result();
            String note = e.getValue().note();
            Long requestId = before.containsKey(item.id()) ? before.get(item.id()).requestId() : null;
            if (result.equals("FAIL") && requestId == null && createRequests && info != null) {
                NewRequest request = createRequest(run, info, item, note, me.userId(), now);
                requestId = request.id();
                created.add(request.code());
            }
            jdbc.sql("""
                    INSERT INTO mnt_inspection_result (inspection_room_id, item_id, result, note, created_request_id)
                    VALUES (:room, :item, :result, :note, :request)
                    ON CONFLICT (inspection_room_id, item_id) DO UPDATE SET result = EXCLUDED.result,
                           note = EXCLUDED.note, created_request_id = EXCLUDED.created_request_id
                    """).param("room", room.id()).param("item", item.id()).param("result", result).param("note", note)
                    .param("request", requestId).update();
        }
        Map<String, StoredCheck> checksBefore = checkResults(List.of(room.id())).getOrDefault(room.id(), List.of())
                .stream().collect(Collectors.toMap(c -> checkId(c.key()), c -> c));
        for (Map.Entry<String, Choice> e : chosenChecks.entrySet()) {
            RoomCheck check = checks.get(e.getKey());
            String result = e.getValue().result();
            String note = e.getValue().note();
            Long requestId = checksBefore.containsKey(check.id()) ? checksBefore.get(check.id()).requestId() : null;
            if (result.equals("FAIL") && requestId == null && createRequests && info != null
                    && check.kind().equals("furniture")) {
                NewRequest request = furnitureRequest(run, info, check, note, me.userId(), now);
                requestId = request.id();
                created.add(request.code());
            }
            jdbc.sql("""
                    INSERT INTO mnt_inspection_room_check (inspection_room_id, check_key, result, note, created_request_id)
                    VALUES (:room, :key, :result, :note, :request)
                    ON CONFLICT (inspection_room_id, check_key) DO UPDATE SET result = EXCLUDED.result,
                           note = EXCLUDED.note, created_request_id = EXCLUDED.created_request_id
                    """).param("room", room.id()).param("key", checkKey(check.id())).param("result", result)
                    .param("note", note).param("request", requestId).update();
        }
        Map<Long, String> after = new HashMap<>();
        results(List.of(room.id())).getOrDefault(room.id(), List.of()).forEach(s -> after.put(s.itemId(), s.result()));
        Map<String, String> checksAfter = new HashMap<>();
        checkResults(List.of(room.id())).getOrDefault(room.id(), List.of())
                .forEach(c -> checksAfter.put(checkId(c.key()), c.result()));
        boolean done = items.keySet().stream().allMatch(i -> after.containsKey(i) && !after.get(i).equals("NOT_CHECKED"))
                && checks.keySet().stream()
                        .allMatch(k -> checksAfter.containsKey(k) && !checksAfter.get(k).equals("NOT_CHECKED"));
        if (done) {
            jdbc.sql("UPDATE mnt_inspection_room SET status = 'INSPECTED', inspected_at = :now WHERE id = :id")
                    .param("now", Timestamp.from(now)).param("id", room.id()).update();
        }
        started(run);
        return new Saved(created);
    }

    @Transactional
    public void unreachable(String id, String roomCode) {
        currentUser.require(Permission.PROCESS_MAINTENANCE);
        Run run = run(id, true);
        open(run);
        RoomRow room = room(run, roomCode);
        if (room.status().equals("INSPECTED")) {
            throw ApiException.conflict("ROOM_DONE", "This Room is already inspected.");
        }
        jdbc.sql("UPDATE mnt_inspection_room SET status = 'UNREACHABLE', inspected_at = :now WHERE id = :id")
                .param("now", Timestamp.from(Instant.now(clock))).param("id", room.id()).update();
        started(run);
    }

    /** Sends the results to the Block Manager; Rooms not visited stay as they are. */
    @Transactional
    public void submit(String id) {
        currentUser.require(Permission.PROCESS_MAINTENANCE);
        Run run = run(id, true);
        open(run);
        jdbc.sql("UPDATE mnt_inspection_run SET status = 'SUBMITTED', submitted_at = :now WHERE id = :id")
                .param("now", Timestamp.from(Instant.now(clock))).param("id", run.id()).update();
        long inspected = roomRows(run.id()).stream().filter(r -> r.status().equals("INSPECTED")).count();
        audit.record("INSPECTION_SUBMITTED", AuditLog.Tone.SUCCESS, "Inspection run", run.id(),
                InspectionScheduleService.code(run.id()), Map.of("inspected", inspected));
    }

    /** The next run of each active schedule in the Blocks, soonest first. */
    @Transactional(readOnly = true)
    public UpcomingPage upcoming(String block) {
        currentUser.require(Permission.PROCESS_MAINTENANCE);
        Set<Long> buildings = blockScope.resolve(block).ids();
        record Row(long id, String name, String scope, Integer floor, Instant next) {
        }
        List<Row> rows = jdbc.sql("""
                SELECT id, name, scope, floors[1] AS floor, next_run_at FROM mnt_inspection_schedule
                WHERE building_id IN (:b) AND status = 'ACTIVE' AND next_run_at > :now
                ORDER BY next_run_at, id
                """).param("b", List.copyOf(buildings)).param("now", Timestamp.from(Instant.now(clock)))
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getString("name"), rs.getString("scope"),
                        rs.getObject("floor", Integer.class), rs.getTimestamp("next_run_at").toInstant()))
                .list();
        return new UpcomingPage(rows.stream().map(r -> new Upcoming(String.valueOf(r.id()),
                LocalDate.ofInstant(r.next(), TimeConfig.CAMPUS_ZONE), InspectionScheduleService.scopeLabel(r.scope(), r.floor()), r.name()))
                .toList());
    }

    // ---------------------------------------------------------------- helpers

    private RunView view(Run run) {
        List<RoomRow> rows = roomRows(run.id());
        Map<Long, List<Stored>> results = results(rows.stream().map(RoomRow::id).toList());
        int failed = (int) results.values().stream().flatMap(List::stream).filter(s -> s.result().equals("FAIL")).count();
        record Head(String name, String scope, Integer floor) {
        }
        Head head = run.scheduleId() == null ? new Head(null, null, null) : jdbc.sql(
                "SELECT name, scope, floors[1] AS floor FROM mnt_inspection_schedule WHERE id = :id")
                .param("id", run.scheduleId())
                .query((rs, i) -> new Head(rs.getString("name"), rs.getString("scope"), rs.getObject("floor", Integer.class)))
                .optional().orElse(new Head(null, null, null));
        ChecklistService.Version version = checklists.versionById(run.checklistId()).orElseThrow();
        List<ChecklistService.Item> items = checklists.items(List.of(version.id())).getOrDefault(version.id(), List.of())
                .stream().map(checklists::item).toList();
        return new RunView(InspectionScheduleService.code(run.id()), run.date(), run.dueAt(), head.name(),
                head.scope() == null ? null : InspectionScheduleService.scopeLabel(head.scope(), head.floor()), rows.size(),
                (int) rows.stream().filter(r -> r.status().equals("INSPECTED")).count(), failed,
                (int) rows.stream().filter(r -> r.status().equals("UNREACHABLE")).count(),
                run.inspectorId() == null ? null : users.displayNames(List.of(run.inspectorId())).get(run.inspectorId()),
                new ChecklistView(version.name(), "v" + version.version(), items));
    }

    /** The Room's own checks: the residents it has now, and its furniture items. */
    private List<RoomCheck> checks(long roomId) {
        List<RoomCheck> checks = new ArrayList<>();
        int residents = terms.publishedTerms().stream().filter(TermSummary::current).findFirst()
                .map(t -> residences.residents(roomId, t.id())).orElse(0);
        checks.add(new RoomCheck("people", "people", residents, null, null, null));
        inventory.furnitureOf(roomId).forEach(f -> checks.add(new RoomCheck("furniture-" + f.id(), "furniture", null,
                f.assetCode(), f.type(), f.typeVi())));
        return checks;
    }

    private static String checkKey(String checkId) {
        return checkId.equals("people") ? "PEOPLE" : "FURNITURE:" + checkId.substring("furniture-".length());
    }

    private static String checkId(String key) {
        return key.equals("PEOPLE") ? "people" : "furniture-" + key.substring("FURNITURE:".length());
    }

    private static Choice choice(Result r) {
        String result = r.result() == null ? null : RESULTS.entrySet().stream()
                .filter(e -> e.getValue().equalsIgnoreCase(r.result().trim()) || e.getKey().equalsIgnoreCase(r.result().trim()))
                .map(Map.Entry::getKey).findFirst().orElse(null);
        if (result == null) {
            throw FieldErrors.single("results", "Send Pass, Fail or Not checked for items of this checklist.");
        }
        String note = r.note() == null || r.note().isBlank() ? null : r.note().trim();
        if (note != null && note.length() > NOTE_MAX) {
            throw FieldErrors.single("results", "Keep each note under " + NOTE_MAX + " characters.");
        }
        return new Choice(result, note);
    }

    /** A furniture item failed: a Furniture Maintenance Request naming it, whose history the item keeps. */
    private NewRequest furnitureRequest(Run run, Inventory.BedSlot room, RoomCheck check, String note, long reporter,
            Instant now) {
        String code = InspectionScheduleService.code(run.id());
        long itemId = Long.parseLong(check.id().substring("furniture-".length()));
        String title = check.type() + " " + check.assetCode() + " needs a repair";
        NewRequest row = jdbc.sql("""
                WITH next AS (SELECT nextval(pg_get_serial_sequence('mnt_request', 'id')) AS id)
                INSERT INTO mnt_request (id, code, room_id, building_id, room_code, reporter_id, source, title,
                                         description, category, location, urgency, priority, staff_may_enter,
                                         reported_at, furniture_item_id)
                OVERRIDING SYSTEM VALUE
                SELECT id, 'MR-' || lpad(id::text, greatest(6, length(id::text)), '0'), :room, :building, :roomCode,
                       :reporter, 'INSPECTION', :title, :description, 'FURNITURE', 'ROOM', 'NORMAL', 'MEDIUM', TRUE, :now,
                       :item
                FROM next
                RETURNING id, code
                """)
                .param("room", room.roomId()).param("building", room.buildingId()).param("roomCode", room.roomCode())
                .param("reporter", reporter).param("title", title.length() > 150 ? title.substring(0, 150) : title)
                .param("description", note != null ? note : "Failed in inspection " + code + ".")
                .param("now", Timestamp.from(now)).param("item", itemId)
                .query((rs, i) -> new NewRequest(rs.getLong("id"), rs.getString("code"))).single();
        requests.event(row.id(), reporter, "STAFF", "Created from inspection " + code, null, false, now);
        events.publishEvent(new MaintenanceReported(row.id(), row.code(), room.buildingId(), "FURNITURE", "NORMAL"));
        events.publishEvent(new FurnitureRepairLogged(itemId, row.code(), title, "Reported", reporter));
        return row;
    }

    private NewRequest createRequest(Run run, Inventory.BedSlot room, ChecklistService.VersionItem item, String note,
            long reporter, Instant now) {
        String code = InspectionScheduleService.code(run.id());
        NewRequest row = jdbc.sql("""
                WITH next AS (SELECT nextval(pg_get_serial_sequence('mnt_request', 'id')) AS id)
                INSERT INTO mnt_request (id, code, room_id, building_id, room_code, reporter_id, source, title,
                                         description, category, location, urgency, priority, staff_may_enter,
                                         reported_at)
                OVERRIDING SYSTEM VALUE
                SELECT id, 'MR-' || lpad(id::text, greatest(6, length(id::text)), '0'), :room, :building, :roomCode,
                       :reporter, 'INSPECTION', :title, :description, :category, 'ROOM', :urgency, :priority, TRUE, :now
                FROM next
                RETURNING id, code
                """)
                .param("room", room.roomId()).param("building", room.buildingId()).param("roomCode", room.roomCode())
                .param("reporter", reporter).param("title", item.label().length() > 150 ? item.label().substring(0, 150)
                        : item.label())
                .param("description", note != null ? note : "Failed in inspection " + code + ".")
                .param("category", item.category()).param("urgency", item.severity().equals("CRITICAL") ? "URGENT" : "NORMAL")
                .param("priority", PRIORITY.get(item.severity())).param("now", Timestamp.from(now))
                .query((rs, i) -> new NewRequest(rs.getLong("id"), rs.getString("code"))).single();
        requests.event(row.id(), reporter, "STAFF", "Created from inspection " + code, null, false, now);
        events.publishEvent(new MaintenanceReported(row.id(), row.code(), room.buildingId(), item.category(),
                item.severity().equals("CRITICAL") ? "URGENT" : "NORMAL"));
        return row;
    }

    private void started(Run run) {
        if (run.status().equals("SCHEDULED")) {
            jdbc.sql("UPDATE mnt_inspection_run SET status = 'IN_PROGRESS' WHERE id = :id").param("id", run.id()).update();
        }
    }

    private static void open(Run run) {
        if (run.status().equals("SUBMITTED")) {
            throw ApiException.conflict("RUN_SUBMITTED", "This inspection run is already submitted.");
        }
    }

    private Run run(String id, boolean lock) {
        String value = id == null ? "" : id.trim().toUpperCase(Locale.ROOT).replaceFirst("^INS-", "");
        Run run = InspectionScheduleService.parse(value).flatMap(n -> jdbc.sql("SELECT * FROM mnt_inspection_run WHERE id = :id"
                + (lock ? " FOR UPDATE" : "")).param("id", n).query((rs, i) -> run(rs)).optional())
                .orElseThrow(() -> ApiException.notFound("This inspection run does not exist."));
        blockScope.check(run.buildingId());
        return run;
    }

    private RoomRow room(Run run, String roomCode) {
        String code = roomCode == null ? "" : roomCode.trim();
        Map<Long, Inventory.BedSlot> info = roomInfo(run.buildingId());
        return roomRows(run.id()).stream()
                .filter(r -> info.containsKey(r.roomId()) && info.get(r.roomId()).roomCode().equalsIgnoreCase(code))
                .findFirst().orElseThrow(() -> ApiException.notFound("Room " + code + " is not in this run."));
    }

    private List<RoomRow> roomRows(long runId) {
        return jdbc.sql("SELECT id, room_id, status FROM mnt_inspection_room WHERE run_id = :run ORDER BY id")
                .param("run", runId)
                .query((rs, i) -> new RoomRow(rs.getLong("id"), rs.getLong("room_id"), rs.getString("status"))).list();
    }

    private Map<Long, List<Stored>> results(List<Long> roomIds) {
        if (roomIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql("""
                SELECT s.inspection_room_id, s.item_id, s.result, s.note, s.created_request_id
                FROM mnt_inspection_result s JOIN mnt_checklist_item i ON i.id = s.item_id
                WHERE s.inspection_room_id IN (:rooms) ORDER BY i.sort_order, i.id
                """).param("rooms", roomIds)
                .query((rs, i) -> Map.entry(rs.getLong("inspection_room_id"), new Stored(rs.getLong("item_id"),
                        rs.getString("result"), rs.getString("note"), rs.getObject("created_request_id", Long.class))))
                .list().stream().collect(Collectors.groupingBy(Map.Entry::getKey, LinkedHashMap::new,
                        Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
    }

    private record StoredCheck(String key, String result, String note, Long requestId) {
    }

    private Map<Long, List<StoredCheck>> checkResults(List<Long> roomIds) {
        if (roomIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql("""
                SELECT inspection_room_id, check_key, result, note, created_request_id FROM mnt_inspection_room_check
                WHERE inspection_room_id IN (:rooms) ORDER BY (check_key = 'PEOPLE') DESC, check_key
                """).param("rooms", roomIds)
                .query((rs, i) -> Map.entry(rs.getLong("inspection_room_id"), new StoredCheck(rs.getString("check_key"),
                        rs.getString("result"), rs.getString("note"), rs.getObject("created_request_id", Long.class))))
                .list().stream().collect(Collectors.groupingBy(Map.Entry::getKey, LinkedHashMap::new,
                        Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
    }

    /** Room id → one of its Beds (Room code, floor, Room Type and Class). */
    private Map<Long, Inventory.BedSlot> roomInfo(long buildingId) {
        Map<Long, Inventory.BedSlot> rooms = new HashMap<>();
        inventory.bedsOfBuilding(buildingId).forEach(b -> rooms.putIfAbsent(b.roomId(), b));
        return rooms;
    }

    private static String status(RoomRow r, boolean anyAnswered) {
        return switch (r.status()) {
            case "INSPECTED" -> "Done";
            case "UNREACHABLE" -> "Not reachable";
            default -> anyAnswered ? "In progress" : "To do";
        };
    }

    private static Run run(ResultSet rs) throws SQLException {
        return new Run(rs.getLong("id"), rs.getObject("schedule_id", Long.class), rs.getLong("building_id"),
                rs.getLong("checklist_id"), rs.getObject("run_date", LocalDate.class),
                rs.getTimestamp("due_at").toInstant(), rs.getObject("inspector_id", Long.class), rs.getString("status"));
    }
}
