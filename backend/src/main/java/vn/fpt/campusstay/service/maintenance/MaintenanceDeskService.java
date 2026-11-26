package vn.fpt.campusstay.service.maintenance;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.setting.BlockSettings;
import vn.fpt.campusstay.service.setting.Lookups;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.event.FurnitureRepairLogged;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.common.file.FileLinks;
import vn.fpt.campusstay.common.file.FileStore;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.repository.maintenance.RequestStore;

/**
 * The Maintenance queue of Staff and Managers: scoped by the request's Block,
 * assignment, priority, visit window, status and updates. Internal notes are
 * never shown to the student; every other change notifies the reporter.
 */
@Service
public class MaintenanceDeskService {

    public record Assignee(String id, String name) {
    }

    /** {@code slaDueAt}: when the request must be finished (the Block's timer), null for older requests. */
    public record QueueItem(String id, String room, String title, String category, String priority,
            Instant reportedAt, Assignee assignee, String status, Instant slaDueAt) {
    }

    /** The furniture item a request names. */
    public record FurnitureRef(String id, String assetCode, String type, String typeVi) {
    }

    public record Summary(long open, long urgent, long urgentUnassigned, long unassigned, Instant oldestUnassignedAt,
            long resolvedThisWeek, long waitingConfirmation) {
    }

    public record QueuePage(List<QueueItem> items, long total, Summary summary) {
    }

    /** {@code status}: {@code open} or labels, comma-separated; {@code assigneeId}: an id or {@code none}. */
    public record Filter(Long termId, String block, String q, String status, String priority, String category,
            String assigneeId) {
    }

    public record Reporter(String name, String role) {
    }

    public record PhotoLink(String url, String name) {
    }

    public record DeskEvent(String who, String role, Instant at, String text, String message, boolean internal) {
    }

    public record RoomSummary(int residents, int capacity, long otherOpen, long pastThisTerm) {
    }

    /**
     * {@code staff}: who may be assigned the request, the staff of its own Block (the PATCH refuses anyone else; Staff
     * may only take an unassigned request for themselves). {@code furnitureItemFixed}: the item came with the request
     * (an inspection finding) and cannot change.
     */
    public record Detail(String id, String title, String status, String room, String bed, String category,
            String location, Instant reportedAt, Reporter reporter, String urgency, String priority,
            boolean staffMayEnter, String description, List<PhotoLink> photos, Assignee assignee,
            String suggestedAssigneeId, String visitWindow, List<DeskEvent> events, RoomSummary roomSummary,
            Instant slaDueAt, FurnitureRef furnitureItem, List<MaintenanceService.FurnitureOption> furnitureOptions,
            InspectionFinding inspectionFinding, List<MaintenanceService.StaffOption> staff,
            boolean furnitureItemFixed, VisitHours visitHours) {
    }

    /** The hours a visit may be planned in: the Block's desk hours ("HH:mm"), or null when the Block has none set. */
    public record VisitHours(String from, String until) {
    }

    private static final java.time.format.DateTimeFormatter HH_MM = java.time.format.DateTimeFormatter.ofPattern("HH:mm");

    /**
     * What the inspection that created the request found: the furniture item's condition (Worn, Damaged, Missing) or
     * the checklist item's Fail, its note, the run and when the Room was inspected. Null for other requests.
     */
    public record InspectionFinding(String condition, String result, String note, String runId, Instant inspectedAt) {
    }

    private static final Map<String, String> FINDING_CONDITIONS = Map.of("GOOD", "Good", "WORN", "Worn", "DAMAGED",
            "Damaged", "MISSING", "Missing");
    private static final Map<String, String> FINDING_RESULTS = Map.of("PASS", "Pass", "FAIL", "Fail", "NOT_CHECKED",
            "Not checked");

    /** The inspection answer that created the request (a Room check or a checklist item), if any. */
    private InspectionFinding finding(long requestId) {
        return jdbc.sql("""
                SELECT c.condition, c.result, c.note, r.run_id, r.inspected_at
                FROM mnt_inspection_room_check c JOIN mnt_inspection_room r ON r.id = c.inspection_room_id
                WHERE c.created_request_id = :id
                UNION ALL
                SELECT NULL, x.result, x.note, r.run_id, r.inspected_at
                FROM mnt_inspection_result x JOIN mnt_inspection_room r ON r.id = x.inspection_room_id
                WHERE x.created_request_id = :id
                LIMIT 1
                """).param("id", requestId)
                .query((rs, i) -> {
                    String cond = rs.getString("condition");
                    String res = rs.getString("result");
                    return new InspectionFinding(
                            cond == null ? null : FINDING_CONDITIONS.get(cond),
                            res == null ? null : FINDING_RESULTS.get(res),
                            rs.getString("note"),
                            InspectionScheduleService.code(rs.getLong("run_id")),
                            rs.getTimestamp("inspected_at") == null ? null : rs.getTimestamp("inspected_at").toInstant());
                })
                .optional().orElse(null);
    }

    private static final Map<String, String> ROLES = Map.of("STUDENT", "Student", "STAFF", "Staff", "MANAGER",
            "Manager", "ADMIN", "Admin");
    private static final Map<String, String> SOURCES = Map.of("STUDENT", "Student", "STAFF", "Staff", "INSPECTION",
            "Inspection");

    private final JdbcClient jdbc;
    private final RequestStore requests;
    private final MaintenanceService labels;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final Residences residences;
    private final Inventory inventory;
    private final UserDirectory users;
    private final Lookups lookups;
    private final FileStore files;
    private final FileLinks links;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;
    private final RequestAudience audience;
    private final BlockSettings blockSettings;
    private final ReportOneRepairs reportOne;

    public MaintenanceDeskService(JdbcClient jdbc, RequestStore requests, MaintenanceService labels,
            CurrentUser currentUser, BlockScope blockScope, Residences residences, Inventory inventory,
            UserDirectory users, Lookups lookups, FileStore files, FileLinks links, ApplicationEventPublisher events,
            AuditLog audit, Clock clock, RequestAudience audience, BlockSettings blockSettings,
            ReportOneRepairs reportOne) {
        this.reportOne = reportOne;
        this.audience = audience;
        this.blockSettings = blockSettings;
        this.jdbc = jdbc;
        this.requests = requests;
        this.labels = labels;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.residences = residences;
        this.inventory = inventory;
        this.users = users;
        this.lookups = lookups;
        this.files = files;
        this.links = links;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- queue

    @Transactional(readOnly = true)
    public QueuePage queue(Filter f, PageQuery page) {
        currentUser.require(Permission.PROCESS_MAINTENANCE); // BE-OPS-10: Block scope alone let the Admin read it
        Set<Long> scope = blockScope.resolve(f.block()).ids();
        Map<String, Object> params = new HashMap<>();
        params.put("scope", List.copyOf(scope));
        StringBuilder base = new StringBuilder(" WHERE building_id IN (:scope)");
        staffOwnOnly().ifPresent(me -> {
            base.append(" AND assignee_id = :me");
            params.put("me", me);
        });
        if (f.termId() != null) {
            base.append(" AND (term_id = :term OR term_id IS NULL)");
            params.put("term", f.termId());
        }
        StringBuilder where = new StringBuilder(base);
        if (f.q() != null && !f.q().isBlank()) {
            where.append(" AND (title ILIKE :q OR code ILIKE :q OR room_code ILIKE :q)");
            params.put("q", "%" + f.q().trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        if (f.status() != null && !f.status().isBlank()) {
            List<String> statuses = new ArrayList<>();
            for (String part : f.status().split(",")) {
                if (part.trim().equalsIgnoreCase("open")) {
                    statuses.addAll(RequestStore.OPEN);
                } else if (!part.isBlank()) {
                    statuses.add(RequestStore.statusCode(part)
                            .orElseThrow(() -> FieldErrors.single("status", "Choose a valid status.")));
                }
            }
            where.append(" AND status IN (:statuses)");
            params.put("statuses", statuses);
        }
        if (f.priority() != null && !f.priority().isBlank()) {
            where.append(" AND priority = :priority");
            params.put("priority", RequestStore.priorityCode(f.priority())
                    .orElseThrow(() -> FieldErrors.single("priority", "Choose High, Medium or Low.")));
        }
        if (f.category() != null && !f.category().isBlank()) {
            where.append(" AND category = :category");
            params.put("category", lookups.find("MAINTENANCE_CATEGORY", f.category().trim()).map(Lookups.Lookup::code)
                    .orElseThrow(() -> FieldErrors.single("category", "Choose a category from the list.")));
        }
        if (f.assigneeId() != null && !f.assigneeId().isBlank()) {
            String a = f.assigneeId().trim();
            if (a.equalsIgnoreCase("none")) {
                where.append(" AND assignee_id IS NULL");
            } else if (a.length() < 19 && a.chars().allMatch(Character::isDigit)) {
                where.append(" AND assignee_id = :assignee");
                params.put("assignee", Long.parseLong(a));
            } else {
                throw FieldErrors.single("assigneeId", "Choose a staff member or none.");
            }
        }
        long total = jdbc.sql("SELECT count(*) FROM mnt_request" + where).params(params).query(Long.class).single();
        params.put("limit", page.limit());
        params.put("offset", page.offset());
        List<RequestStore.Request> rows = jdbc.sql("SELECT * FROM mnt_request" + where + """
                 ORDER BY (status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')) DESC,
                          CASE priority WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, reported_at DESC, id DESC
                 LIMIT :limit OFFSET :offset
                """).params(params).query(RequestStore::request).list();
        Map<Long, String> names = users.displayNames(rows.stream().map(RequestStore.Request::assigneeId)
                .filter(Objects::nonNull).collect(Collectors.toSet()));
        List<QueueItem> items = rows.stream().map(r -> new QueueItem(r.code(), r.roomCode(), r.title(),
                labels.label("MAINTENANCE_CATEGORY", r.category()), RequestStore.priorityLabel(r.priority()),
                r.reportedAt(), assignee(r.assigneeId(), names), RequestStore.statusLabel(r.status()), r.slaDueAt()))
                .toList();
        return new QueuePage(items, total, summary(base.toString(), params));
    }

    private Summary summary(String where, Map<String, Object> params) {
        Instant weekStart = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE))
                .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).atStartOfDay(TimeConfig.CAMPUS_ZONE)
                .toInstant();
        Map<String, Object> p = new HashMap<>(params);
        p.put("weekStart", Timestamp.from(weekStart));
        return jdbc.sql("""
                SELECT count(*) FILTER (WHERE status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')) AS open,
                       count(*) FILTER (WHERE status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS') AND priority = 'HIGH') AS urgent,
                       count(*) FILTER (WHERE status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS') AND priority = 'HIGH'
                                          AND assignee_id IS NULL) AS urgent_unassigned,
                       count(*) FILTER (WHERE status = 'SUBMITTED' AND assignee_id IS NULL) AS unassigned,
                       min(reported_at) FILTER (WHERE status = 'SUBMITTED' AND assignee_id IS NULL) AS oldest,
                       count(*) FILTER (WHERE resolved_at >= :weekStart) AS resolved_week,
                       count(*) FILTER (WHERE status = 'RESOLVED') AS waiting
                FROM mnt_request""" + where)
                .params(p)
                .query((rs, i) -> new Summary(rs.getLong("open"), rs.getLong("urgent"), rs.getLong("urgent_unassigned"),
                        rs.getLong("unassigned"), RequestStore.instant(rs, "oldest"), rs.getLong("resolved_week"),
                        rs.getLong("waiting")))
                .single();
    }

    // ---------------------------------------------------------------- detail

    @Transactional(readOnly = true)
    public Detail detail(String idOrCode) {
        currentUser.require(Permission.PROCESS_MAINTENANCE);
        RequestStore.Request r = inScope(idOrCode, false);
        List<RequestStore.Event> history = requests.events(r.id());
        List<Long> people = new ArrayList<>(history.stream().map(RequestStore.Event::actorId).filter(Objects::nonNull)
                .toList());
        people.add(r.reporterId());
        if (r.assigneeId() != null) {
            people.add(r.assigneeId());
        }
        Map<Long, String> names = users.displayNames(Set.copyOf(people));
        String bed = r.bedId() == null ? null : Optional.ofNullable(inventory.beds(List.of(r.bedId())).get(r.bedId()))
                .map(Inventory.BedSlot::bedLabel).orElse(null);
        List<PhotoLink> photos = jdbc.sql("SELECT file_id FROM mnt_request_photo WHERE request_id = :id ORDER BY file_id")
                .param("id", r.id()).query(Long.class).list().stream()
                .map(id -> files.info(id).map(f -> new PhotoLink(links.link(f.id()), f.name())).orElse(null))
                .filter(Objects::nonNull).toList();
        long otherOpen = jdbc.sql("""
                SELECT count(*) FROM mnt_request
                WHERE room_id = :room AND id <> :id AND status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')
                """).param("room", r.roomId()).param("id", r.id()).query(Long.class).single();
        long pastThisTerm = r.termId() == null ? 0 : jdbc.sql("""
                SELECT count(*) FROM mnt_request WHERE room_id = :room AND id <> :id AND term_id = :term
                """).param("room", r.roomId()).param("id", r.id()).param("term", r.termId()).query(Long.class).single();
        RoomSummary room = new RoomSummary(r.termId() == null ? 0 : residences.residents(r.roomId(), r.termId()),
                inventory.bedsOfRoom(r.roomId()).size(), otherOpen, pastThisTerm);
        List<MaintenanceService.FurnitureOption> furniture = labels.furnitureOf(r.roomId());
        FurnitureRef item = r.furnitureItemId() == null ? null : furniture.stream()
                .filter(f -> f.id().equals(String.valueOf(r.furnitureItemId()))).findFirst()
                .map(f -> new FurnitureRef(f.id(), f.assetCode(), f.type(), f.typeVi()))
                .orElse(new FurnitureRef(String.valueOf(r.furnitureItemId()), null, null, null));
        return new Detail(r.code(), r.title(), RequestStore.statusLabel(r.status()), r.roomCode(), bed,
                labels.label("MAINTENANCE_CATEGORY", r.category()), labels.label("MAINTENANCE_LOCATION", r.location()),
                r.reportedAt(), new Reporter(names.get(r.reporterId()), SOURCES.get(r.source())),
                RequestStore.urgencyLabel(r.urgency()), RequestStore.priorityLabel(r.priority()), r.staffMayEnter(),
                r.description(), photos, assignee(r.assigneeId(), names),
                r.assigneeId() == null ? suggestedAssignee(r.buildingId()).map(String::valueOf).orElse(null) : null,
                RequestStore.visitWindow(r.visitStart(), r.visitEnd()),
                history.stream().map(e -> new DeskEvent(e.actorId() == null ? "CampusStay" : names.get(e.actorId()),
                        e.actorRole() == null ? "System" : ROLES.getOrDefault(e.actorRole(), e.actorRole()), e.at(),
                        e.text(), e.message(), e.internal())).toList(),
                room, r.slaDueAt(), item, furniture, "INSPECTION".equals(r.source()) ? finding(r.id()) : null,
                labels.staffOptions(List.of(r.buildingId())), furnitureItemFixed(r), visitHours(r.buildingId()));
    }

    /** A request an inspection created for a furniture item keeps that item: the finding is about it. */
    private static boolean furnitureItemFixed(RequestStore.Request r) {
        return r.furnitureItemId() != null && "INSPECTION".equals(r.source());
    }

    /** The Block's maintenance staff member with the fewest open requests (ties: by name). */
    private Optional<Long> suggestedAssignee(long buildingId) {
        List<UserDirectory.StaffMember> staff = users.staffOf(List.of(buildingId)).stream()
                .filter(m -> m.handles().contains(MaintenanceService.MAINTENANCE)).toList();
        if (staff.isEmpty()) {
            return Optional.empty();
        }
        Map<Long, Long> load = new HashMap<>();
        jdbc.sql("""
                SELECT assignee_id, count(*) AS n FROM mnt_request
                WHERE assignee_id IN (:ids) AND status IN ('ASSIGNED', 'IN_PROGRESS') GROUP BY assignee_id
                """).param("ids", staff.stream().map(UserDirectory.StaffMember::userId).toList())
                .query((rs, i) -> Map.entry(rs.getLong("assignee_id"), rs.getLong("n"))).list()
                .forEach(e -> load.put(e.getKey(), e.getValue()));
        return staff.stream().min(Comparator.comparing((UserDirectory.StaffMember m) -> load.getOrDefault(m.userId(), 0L))
                .thenComparing(UserDirectory.StaffMember::name)).map(UserDirectory.StaffMember::userId);
    }

    // ---------------------------------------------------------------- changes

    /**
     * Applies the fields present in the body: {@code priority}, {@code furnitureItemId} (null = none),
     * {@code assigneeId} (null = unassign), {@code visitWindow} (null = clear) and {@code status}, in that order.
     */
    @Transactional
    public void update(String idOrCode, Map<String, Object> body) {
        AuthenticatedUser user = currentUser.require(Permission.PROCESS_MAINTENANCE);
        RequestStore.Request r = inScope(idOrCode, true);
        if (r.status().equals("CLOSED")) {
            throw ApiException.conflict("REQUEST_CLOSED", "This request is closed and cannot change.");
        }
        Instant now = Instant.now(clock);
        String role = user.role().name();
        Map<String, Object> changes = new LinkedHashMap<>();
        String status = r.status();
        Long assignee = r.assigneeId();
        boolean studentVisible = false;
        String visitText = null;

        if (body.containsKey("priority") && body.get("priority") != null) {
            String priority = RequestStore.priorityCode(String.valueOf(body.get("priority")))
                    .orElseThrow(() -> FieldErrors.single("priority", "Choose High, Medium or Low."));
            if (!priority.equals(r.priority())) {
                jdbc.sql("UPDATE mnt_request SET priority = :p WHERE id = :id").param("p", priority).param("id", r.id())
                        .update();
                requests.event(r.id(), user.userId(), role, "Priority set to " + RequestStore.priorityLabel(priority),
                        null, true, now);
                changes.put("priority", RequestStore.priorityLabel(priority));
            }
        }
        Long furnitureItem = r.furnitureItemId();
        if (body.containsKey("furnitureItemId")) {
            FieldErrors errors = new FieldErrors();
            Long wanted = labels.furnitureItem(body.get("furnitureItemId"), r.roomId(), errors);
            errors.throwIfAny();
            if (!Objects.equals(wanted, furnitureItem) && furnitureItemFixed(r)) {
                throw ApiException.conflict("FURNITURE_ITEM_FIXED",
                        "This request was created for this furniture item, which cannot change.");
            }
            if (!Objects.equals(wanted, furnitureItem)) {
                jdbc.sql("UPDATE mnt_request SET furniture_item_id = :f WHERE id = :id").param("f", wanted)
                        .param("id", r.id()).update();
                requests.event(r.id(), user.userId(), role, wanted == null ? "Furniture item removed"
                        : "Furniture item set", null, true, now);
                if (wanted != null) {
                    events.publishEvent(new FurnitureRepairLogged(wanted, r.code(), r.title(), "Reported", user.userId()));
                }
                furnitureItem = wanted;
                changes.put("furnitureItem", wanted == null ? "none" : String.valueOf(wanted));
            }
        }
        if (body.containsKey("assigneeId")) {
            Long wanted = id(body.get("assigneeId"));
            if (!Objects.equals(wanted, assignee) && user.role() == Role.STAFF) {
                // Staff take an unassigned request for themselves (or give back their own); only Managers assign
                // a request to someone else or move it from one person to another.
                if (wanted != null && wanted != user.userId()) {
                    throw ApiException.forbidden("STAFF_ASSIGN_SELF_ONLY",
                            "Staff take a request for themselves only. A Manager assigns it to someone else.");
                }
                if (assignee != null && assignee != user.userId()) {
                    throw ApiException.conflict("ASSIGNED_TO_SOMEONE_ELSE", "This request is assigned to "
                            + users.displayNames(List.of(assignee)).get(assignee)
                            + ". Only a Manager can move it to someone else.");
                }
            }
            if (!Objects.equals(wanted, assignee)) {
                if (wanted == null) {
                    if (!status.equals("ASSIGNED") && !status.equals("SUBMITTED")) {
                        throw FieldErrors.single("assigneeId", "Keep someone assigned while the work is in progress.");
                    }
                    status = "SUBMITTED";
                    requests.event(r.id(), user.userId(), role, "Unassigned", null, true, now);
                } else {
                    UserDirectory.StaffMember member = users.staffOf(List.of(r.buildingId())).stream()
                            .filter(m -> m.userId() == wanted).findFirst()
                            .orElseThrow(() -> FieldErrors.single("assigneeId", "Choose a staff member of this Block."));
                    if (status.equals("SUBMITTED")) {
                        status = "ASSIGNED";
                    }
                    requests.event(r.id(), user.userId(), role, "Assigned to " + member.name(), null, false, now);
                    studentVisible = true;
                }
                assignee = wanted;
                jdbc.sql("UPDATE mnt_request SET assignee_id = :a, status = :s WHERE id = :id")
                        .param("a", assignee).param("s", status).param("id", r.id()).update();
                changes.put("assignee", assignee == null ? "none" : String.valueOf(assignee));
            }
        }
        if (body.containsKey("visitWindow")) {
            Object value = body.get("visitWindow");
            Instant[] window = null;
            if (value != null && !String.valueOf(value).isBlank()) {
                window = RequestStore.parseVisitWindow(String.valueOf(value))
                        .orElseThrow(() -> FieldErrors.single("visitWindow",
                                "Use dd/mm/yyyy hh:mm – hh:mm, with the end after the start."));
            }
            // Only a new or changed window is checked: one planned earlier stays as is when other fields change.
            if (window != null && !Objects.equals(RequestStore.visitWindow(window[0], window[1]),
                    RequestStore.visitWindow(r.visitStart(), r.visitEnd()))) {
                if (window[1].isBefore(now)) {
                    throw FieldErrors.single("visitWindow", "Choose a visit window that has not ended yet.");
                }
                checkVisitWindow(window, r.buildingId(), now);
            }
            jdbc.sql("UPDATE mnt_request SET visit_window_start = :s, visit_window_end = :e WHERE id = :id")
                    .param("s", window == null ? null : Timestamp.from(window[0]))
                    .param("e", window == null ? null : Timestamp.from(window[1])).param("id", r.id()).update();
            visitText = window == null ? null : RequestStore.visitWindow(window[0], window[1]);
            if (!Objects.equals(visitText, RequestStore.visitWindow(r.visitStart(), r.visitEnd()))) {
                requests.event(r.id(), user.userId(), role, visitText == null ? "Visit window removed"
                        : "Visit planned " + visitText, null, false, now);
                changes.put("visitWindow", visitText == null ? "none" : visitText);
                studentVisible = true;
            }
        }
        if (body.containsKey("status") && body.get("status") != null) {
            String wanted = RequestStore.statusCode(String.valueOf(body.get("status")))
                    .orElseThrow(() -> FieldErrors.single("status", "Choose a valid status."));
            if (!wanted.equals(status)) {
                // The person in charge does the work: other Staff take the request over first (Managers may act).
                if (user.role() == Role.STAFF && assignee != null && assignee != user.userId()) {
                    throw ApiException.conflict("ASSIGNED_TO_SOMEONE_ELSE", "This request is assigned to "
                            + users.displayNames(List.of(assignee)).get(assignee)
                            + ". Only the person in charge changes its status.");
                }
                status = transition(r, status, wanted, assignee, now);
                requests.event(r.id(), user.userId(), role, "Status: " + RequestStore.statusLabel(status), null, false,
                        now);
                changes.put("status", RequestStore.statusLabel(status));
                studentVisible = true;
                if (status.equals("RESOLVED") && furnitureItem != null) {
                    events.publishEvent(new FurnitureRepairLogged(furnitureItem, r.code(), r.title(), "Resolved",
                            user.userId()));
                }
                // Report 1 follows the repair: done once resolved in an empty Room (a resident confirms it
                // otherwise), or once closed.
                if (status.equals("CLOSED") || status.equals("RESOLVED") && audience.residentsOf(r.roomId()).isEmpty()) {
                    reportOne.repaired(r);
                }
            }
        }
        jdbc.sql("UPDATE mnt_request SET version = version + 1 WHERE id = :id").param("id", r.id()).update();
        if (!changes.isEmpty()) {
            audit.record("MAINTENANCE_UPDATED", AuditLog.Tone.INFO, "Maintenance Request", r.id(), r.code(), changes);
        }
        if (studentVisible) {
            audience.notify(r, RequestStore.statusLabel(status), visitText == null ? null : "Visit planned " + visitText);
        }
    }

    private String transition(RequestStore.Request r, String from, String to, Long assignee, Instant now) {
        switch (to) {
            case "ASSIGNED", "IN_PROGRESS" -> {
                if (assignee == null) {
                    throw FieldErrors.single("assigneeId", "Assign someone first.");
                }
                jdbc.sql("UPDATE mnt_request SET status = :s, resolved_at = NULL WHERE id = :id").param("s", to)
                        .param("id", r.id()).update();
            }
            case "RESOLVED" -> {
                if (!from.equals("ASSIGNED") && !from.equals("IN_PROGRESS")) {
                    throw ApiException.conflict("NOT_STARTED", "Assign the request before you mark it resolved.");
                }
                jdbc.sql("UPDATE mnt_request SET status = 'RESOLVED', resolved_at = :now WHERE id = :id")
                        .param("now", Timestamp.from(now)).param("id", r.id()).update();
            }
            case "CLOSED" -> {
                // Closing skips the fix and the student's confirmation unless the request was resolved first (BE-OPS-06).
                if (!from.equals("RESOLVED")) {
                    throw ApiException.conflict("NOT_RESOLVED", "Mark the request resolved before you close it.");
                }
                jdbc.sql("UPDATE mnt_request SET status = 'CLOSED', closed_at = :now WHERE id = :id")
                        .param("now", Timestamp.from(now)).param("id", r.id()).update();
            }
            default -> throw FieldErrors.single("status", "To send it back to the queue, remove the assignee.");
        }
        return to;
    }

    /** A Staff update: public ones reach the student, internal notes stay in the back office. */
    @Transactional
    public void addUpdate(String idOrCode, String message, boolean internal) {
        AuthenticatedUser user = currentUser.require(Permission.PROCESS_MAINTENANCE);
        if (message == null || message.isBlank()) {
            throw FieldErrors.single("message", "Write the update.");
        }
        RequestStore.Request r = inScope(idOrCode, true);
        boolean privateNote = internal; // inspection requests reach the Room's residents too (RequestAudience)
        if (!privateNote && r.status().equals("CLOSED")) { // the student can no longer answer (BE-OPS-14)
            throw ApiException.conflict("REQUEST_CLOSED", "This request is closed: only internal notes can be added.");
        }
        requests.event(r.id(), user.userId(), user.role().name(), null, message.trim(), privateNote,
                Instant.now(clock));
        if (!privateNote) {
            audience.notify(r, RequestStore.statusLabel(r.status()), message.trim());
        }
    }

    // ---------------------------------------------------------------- helpers

    private VisitHours visitHours(long buildingId) {
        return blockSettings.forBlock(buildingId)
                .map(s -> new VisitHours(HH_MM.format(s.deskOpens()), HH_MM.format(s.deskCloses()))).orElse(null);
    }

    /**
     * A new visit window starts from now on, within one day and inside the Block's desk hours: the students of the
     * Room are told the time, so it must be one Staff can still keep.
     */
    private void checkVisitWindow(Instant[] window, long buildingId, Instant now) {
        java.time.ZonedDateTime start = window[0].atZone(TimeConfig.CAMPUS_ZONE);
        java.time.ZonedDateTime end = window[1].atZone(TimeConfig.CAMPUS_ZONE);
        if (window[0].isBefore(now)) {
            throw FieldErrors.single("visitWindow", "The visit cannot start in the past. Choose a later time.");
        }
        if (!start.toLocalDate().equals(end.toLocalDate())) {
            throw FieldErrors.single("visitWindow", "The visit starts and ends on the same day.");
        }
        blockSettings.forBlock(buildingId).ifPresent(s -> {
            if (start.toLocalTime().isBefore(s.deskOpens()) || end.toLocalTime().isAfter(s.deskCloses())) {
                throw FieldErrors.single("visitWindow", "Plan the visit within the Block's hours, "
                        + HH_MM.format(s.deskOpens()) + " – " + HH_MM.format(s.deskCloses()) + ".");
            }
        });
    }

    private RequestStore.Request inScope(String idOrCode, boolean lock) {
        Set<Long> scope = blockScope.resolve(null).ids();
        RequestStore.Request r = requests.find(idOrCode, lock)
                .orElseThrow(() -> ApiException.notFound("This Maintenance Request does not exist."));
        if (!scope.contains(r.buildingId())) {
            throw ApiException.forbidden("BLOCK_OUT_OF_SCOPE", "You do not have access to this Block.");
        }
        if (staffOwnOnly().filter(me -> !me.equals(r.assigneeId())).isPresent()) {
            throw ApiException.notFound("This Maintenance Request does not exist.");
        }
        return r;
    }

    /**
     * Staff see only the Maintenance Requests assigned to them (user decision 25/11/2026): the queue, the detail and
     * every change. Managers assign the others (routing rules, inspections and escalations assign too). Empty for
     * Managers and Admins.
     */
    private Optional<Long> staffOwnOnly() {
        AuthenticatedUser user = currentUser.require(Permission.PROCESS_MAINTENANCE);
        return user.role() == Role.STAFF ? Optional.of(user.userId()) : Optional.empty();
    }

    private static Assignee assignee(Long id, Map<Long, String> names) {
        return id == null ? null : new Assignee(String.valueOf(id), names.get(id));
    }

    private static Long id(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        String v = String.valueOf(value).trim();
        if (v.length() > 18 || !v.chars().allMatch(Character::isDigit)) {
            throw FieldErrors.single("assigneeId", "Choose a staff member of this Block.");
        }
        return Long.parseLong(v);
    }
}
