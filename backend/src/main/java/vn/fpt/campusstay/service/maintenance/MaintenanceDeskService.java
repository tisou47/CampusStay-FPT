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
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.setting.Lookups;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.event.MaintenanceUpdated;
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

    public record QueueItem(String id, String room, String title, String category, String priority,
            Instant reportedAt, Assignee assignee, String status) {
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

    public record Detail(String id, String title, String status, String room, String bed, String category,
            String location, Instant reportedAt, Reporter reporter, String urgency, String priority,
            boolean staffMayEnter, String description, List<PhotoLink> photos, Assignee assignee,
            String suggestedAssigneeId, String visitWindow, List<DeskEvent> events, RoomSummary roomSummary) {
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

    public MaintenanceDeskService(JdbcClient jdbc, RequestStore requests, MaintenanceService labels,
            CurrentUser currentUser, BlockScope blockScope, Residences residences, Inventory inventory,
            UserDirectory users, Lookups lookups, FileStore files, FileLinks links, ApplicationEventPublisher events,
            AuditLog audit, Clock clock) {
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
        Set<Long> scope = blockScope.resolve(f.block()).ids();
        Map<String, Object> params = new HashMap<>();
        params.put("scope", List.copyOf(scope));
        StringBuilder base = new StringBuilder(" WHERE building_id IN (:scope)");
        if (f.termId() != null) {
            base.append(" AND term_id = :term");
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
                r.reportedAt(), assignee(r.assigneeId(), names), RequestStore.statusLabel(r.status()))).toList();
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
                room);
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
     * Applies the fields present in the body: {@code priority}, {@code assigneeId} (null = unassign),
     * {@code visitWindow} (null = clear) and {@code status}, in that order.
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
        if (body.containsKey("assigneeId")) {
            Long wanted = id(body.get("assigneeId"));
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
                status = transition(r, status, wanted, assignee, now);
                requests.event(r.id(), user.userId(), role, "Status: " + RequestStore.statusLabel(status), null, false,
                        now);
                changes.put("status", RequestStore.statusLabel(status));
                studentVisible = true;
            }
        }
        jdbc.sql("UPDATE mnt_request SET version = version + 1 WHERE id = :id").param("id", r.id()).update();
        if (!changes.isEmpty()) {
            audit.record("MAINTENANCE_UPDATED", AuditLog.Tone.INFO, "Maintenance Request", r.id(), r.code(), changes);
        }
        if (studentVisible && r.source().equals("STUDENT")) {
            events.publishEvent(new MaintenanceUpdated(r.id(), r.code(), r.reporterId(), r.title(),
                    RequestStore.statusLabel(status), visitText == null ? null : "Visit planned " + visitText));
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
            case "CLOSED" -> jdbc.sql("UPDATE mnt_request SET status = 'CLOSED', closed_at = :now WHERE id = :id")
                    .param("now", Timestamp.from(now)).param("id", r.id()).update();
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
        boolean privateNote = internal || !r.source().equals("STUDENT");
        requests.event(r.id(), user.userId(), user.role().name(), null, message.trim(), privateNote,
                Instant.now(clock));
        if (!privateNote) {
            events.publishEvent(new MaintenanceUpdated(r.id(), r.code(), r.reporterId(), r.title(),
                    RequestStore.statusLabel(r.status()), message.trim()));
        }
    }

    // ---------------------------------------------------------------- helpers

    private RequestStore.Request inScope(String idOrCode, boolean lock) {
        Set<Long> scope = blockScope.resolve(null).ids();
        RequestStore.Request r = requests.find(idOrCode, lock)
                .orElseThrow(() -> ApiException.notFound("This Maintenance Request does not exist."));
        if (!scope.contains(r.buildingId())) {
            throw ApiException.forbidden("BLOCK_OUT_OF_SCOPE", "You do not have access to this Block.");
        }
        return r;
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
