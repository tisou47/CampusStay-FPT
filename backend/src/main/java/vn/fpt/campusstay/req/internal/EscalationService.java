package vn.fpt.campusstay.req.internal;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.asg.Moves;
import vn.fpt.campusstay.auth.BlockDirectory;
import vn.fpt.campusstay.auth.BlockScope;
import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.auth.Permission;
import vn.fpt.campusstay.auth.UserDirectory;
import vn.fpt.campusstay.cfg.Lookups;
import vn.fpt.campusstay.cfg.Parameters;
import vn.fpt.campusstay.mnt.MaintenanceRequests;
import vn.fpt.campusstay.req.EscalationAssigned;
import vn.fpt.campusstay.shared.audit.AuditLog;
import vn.fpt.campusstay.shared.error.ApiException;
import vn.fpt.campusstay.shared.error.FieldErrors;

/**
 * Block Manager › Escalations. A scan opens an escalation when a Maintenance Request
 * passes its Block's timer, stays unassigned or is reopened, or a Room-Change Request
 * stays undecided past its due time, and closes it once the request is back on track
 * or closed. One open escalation per request; a request escalates once per reason.
 * The Manager hands the request to someone else or, for a room change, offers a
 * temporary Bed. Items are addressed by the request's code.
 */
@Service
public class EscalationService {

    public record Handled(String action, Instant at, String note) {
    }

    public record Event(String text, Instant at) {
    }

    /** @param kind {@code maintenance} or {@code room-change}; {@code tone} info, warning or error */
    public record Item(String id, String kind, String title, String subtitle, String room, String why, String tone,
            String openFor, String ownerName, Handled handled, List<Event> events, String suggestedAssigneeId,
            String link, boolean canOfferTemporaryBed) {
    }

    public record Assignee(String id, String name) {
    }

    public record Page(List<Item> items, List<Assignee> assignees) {
    }

    private record Row(long id, long buildingId, Long termId, String kind, String sourceType, long sourceId,
            String sourceCode, Instant sourceAt, String title, String subtitle, String room, String why, String tone,
            Long ownerId, String status, Instant openedAt, String handledAction, Instant handledAt, String handledNote,
            String link) {
    }

    /** What a request looks like to the scan. */
    private record Source(String type, long id, String code, long buildingId, Long termId, Instant startedAt,
            String title, String subtitle, String room, Long ownerId, String link) {
    }

    private record Reason(String kind, String why, String tone) {
    }

    private record RoomChange(long id, String code, long termId, long studentId, long allocationId, long buildingId,
            String kind, String reason, Long assigneeId, Instant slaDueAt, Instant submittedAt) {
    }

    private static final String MAINTENANCE = "MAINTENANCE";
    private static final String ROOM_CHANGE = "ROOM_CHANGE";
    /** Handled escalations stay on the screen this long. */
    private static final Duration SHOW_HANDLED = Duration.ofDays(7);
    private static final Map<String, String> TONES = Map.of("INFO", "info", "WARNING", "warning", "DANGER", "error");
    private static final Map<String, String> ASKS = Map.of("SAME", "another Room", "CLASS", "another Room Class",
            "TYPE", "another Room Type");

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blocks;
    private final UserDirectory users;
    private final Lookups lookups;
    private final Parameters parameters;
    private final MaintenanceRequests maintenance;
    private final Moves moves;
    private final RoutingService routing;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public EscalationService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, BlockDirectory blocks,
            UserDirectory users, Lookups lookups, Parameters parameters, MaintenanceRequests maintenance, Moves moves,
            RoutingService routing, ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blocks = blocks;
        this.users = users;
        this.lookups = lookups;
        this.parameters = parameters;
        this.maintenance = maintenance;
        this.moves = moves;
        this.routing = routing;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- scan (job)

    /** Opens, upgrades and closes escalations of every active Block; returns how many opened. */
    @Transactional
    public int scan() {
        Instant now = Instant.now(clock);
        Set<Long> buildings = blocks.allActiveIds();
        Map<Long, RoutingService.Sla> slas = new HashMap<>();
        int unassignedHours = parameters.intValue("sla.unassigned_max_hours");
        Set<String> open = new HashSet<>();
        int opened = 0;

        for (MaintenanceRequests.OpenRequest r : maintenance.open(buildings)) {
            open.add(MAINTENANCE + r.id());
            RoutingService.Sla sla = slas.computeIfAbsent(r.buildingId(), routing::sla);
            int limit = "URGENT".equals(r.urgency()) ? sla.urgent() : sla.normal();
            Reason reason = null;
            if (r.reportedAt().plus(Duration.ofHours(limit)).isBefore(now)) {
                reason = new Reason("SLA_BREACH", "Past the " + limit + "-hour limit", "DANGER");
            } else if (r.assigneeId() == null && r.reportedAt().plus(Duration.ofHours(unassignedHours)).isBefore(now)) {
                reason = new Reason("NO_ASSIGNEE", "No assignee after " + hours(unassignedHours), "WARNING");
            } else if (r.reopenCount() > 0) {
                reason = new Reason("REOPENED", "Reopened by the student", "WARNING");
            }
            String subtitle = label("MAINTENANCE_CATEGORY", r.category()) + " · "
                    + ("URGENT".equals(r.urgency()) ? "Urgent" : "Normal");
            Source source = new Source(MAINTENANCE, r.id(), r.code(), r.buildingId(), r.termId(), r.reportedAt(),
                    r.title(), subtitle, r.room(), r.assigneeId(), "/manager/maintenance/" + r.code());
            opened += sync(source, reason, now);
        }

        List<RoomChange> changes = buildings.isEmpty() ? List.of() : jdbc.sql("""
                SELECT * FROM req_room_change WHERE building_id IN (:b) AND status IN ('SUBMITTED', 'PENDING')
                ORDER BY submitted_at, id
                """).param("b", List.copyOf(buildings)).query(EscalationService::roomChange).list();
        Map<Long, String> names = users.displayNames(changes.stream().map(RoomChange::studentId).toList());
        Map<Long, Moves.Placement> from = moves.placements(changes.stream().map(RoomChange::allocationId).toList());
        for (RoomChange c : changes) {
            open.add(ROOM_CHANGE + c.id());
            Reason reason = c.slaDueAt() != null && c.slaDueAt().isBefore(now)
                    ? new Reason("SLA_BREACH", "Undecided after " + hours(Duration.between(c.submittedAt(), c.slaDueAt())
                            .toHours()), "DANGER")
                    : null;
            Moves.Placement p = from.get(c.allocationId());
            Source source = new Source(ROOM_CHANGE, c.id(), c.code(), c.buildingId(), c.termId(), c.submittedAt(),
                    names.get(c.studentId()) + " asks for " + ASKS.get(c.kind()),
                    label("ROOM_CHANGE_REASON", c.reason()), p == null ? null : p.room(), c.assigneeId(), null);
            opened += sync(source, reason, now);
        }

        jdbc.sql("SELECT * FROM req_escalation WHERE status = 'OPEN'").query(EscalationService::row).list().stream()
                .filter(e -> !open.contains(e.sourceType() + e.sourceId()))
                .forEach(e -> close(e, "The request was closed.", now));
        return opened;
    }

    private int sync(Source s, Reason reason, Instant now) {
        Optional<Row> current = jdbc.sql("""
                SELECT * FROM req_escalation WHERE source_type = :type AND source_id = :id AND status = 'OPEN' FOR UPDATE
                """).param("type", s.type()).param("id", s.id()).query(EscalationService::row).optional();
        if (current.isPresent()) {
            Row e = current.get();
            if (reason == null) {
                close(e, e.kind().equals("NO_ASSIGNEE") ? "The request now has an assignee."
                        : "The request is back on track.", now);
                return 0;
            }
            if (reason.kind().equals("SLA_BREACH") && !e.kind().equals("SLA_BREACH")) {
                jdbc.sql("UPDATE req_escalation SET kind = :kind, why = :why, tone = :tone, version = version + 1 WHERE id = :id")
                        .param("kind", reason.kind()).param("why", reason.why()).param("tone", reason.tone())
                        .param("id", e.id()).update();
                event(e.id(), "Escalated: " + reason.why(), now);
            }
            if (!Objects.equals(e.ownerId(), s.ownerId())) {
                jdbc.sql("UPDATE req_escalation SET owner_id = :owner WHERE id = :id")
                        .param("owner", s.ownerId()).param("id", e.id()).update();
            }
            return 0;
        }
        if (reason == null) {
            return 0;
        }
        boolean before = jdbc.sql("SELECT count(*) FROM req_escalation WHERE source_type = :type AND source_id = :id AND kind = :kind")
                .param("type", s.type()).param("id", s.id()).param("kind", reason.kind()).query(Long.class).single() > 0;
        if (before) {
            return 0;
        }
        Optional<Long> id = jdbc.sql("""
                INSERT INTO req_escalation (building_id, term_id, kind, source_type, source_id, source_code, source_at,
                                            title, subtitle, room_code, link, why, tone, owner_id, opened_at)
                VALUES (:b, :term, :kind, :type, :id, :code, :startedAt, :title, :subtitle, :room, :link, :why, :tone,
                        :owner, :now)
                ON CONFLICT (source_type, source_id) WHERE status = 'OPEN' DO NOTHING
                RETURNING id
                """)
                .param("b", s.buildingId()).param("term", s.termId()).param("kind", reason.kind()).param("type", s.type())
                .param("id", s.id()).param("code", s.code()).param("startedAt", Timestamp.from(s.startedAt()))
                .param("title", cut(s.title(), 200)).param("subtitle", cut(s.subtitle(), 200)).param("room", s.room())
                .param("link", s.link()).param("why", reason.why()).param("tone", reason.tone())
                .param("owner", s.ownerId()).param("now", Timestamp.from(now))
                .query(Long.class).optional();
        id.ifPresent(e -> event(e, "Escalated: " + reason.why(), now));
        return id.isPresent() ? 1 : 0;
    }

    private void close(Row e, String note, Instant now) {
        jdbc.sql("""
                UPDATE req_escalation SET status = 'HANDLED', handled_action = 'CLOSED', handled_at = :now,
                       handled_note = :note, version = version + 1
                WHERE id = :id AND status = 'OPEN'
                """).param("now", Timestamp.from(now)).param("note", note).param("id", e.id()).update();
        event(e.id(), "Closed automatically", now);
    }

    // ---------------------------------------------------------------- screen

    /** Open escalations and those handled in the last 7 days; {@code termId} null = every Term. */
    @Transactional(readOnly = true)
    public Page list(Long termId, String block) {
        currentUser.require(Permission.MANAGE_BLOCK);
        Set<Long> buildings = blockScope.resolve(block).ids();
        Instant now = Instant.now(clock);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("b", List.copyOf(buildings));
        params.put("since", Timestamp.from(now.minus(SHOW_HANDLED)));
        if (termId != null) {
            params.put("term", termId);
        }
        String sql = "SELECT DISTINCT ON (source_type, source_id) * FROM req_escalation"
                + " WHERE building_id IN (:b) AND (status = 'OPEN' OR handled_at > :since)"
                + (termId == null ? "" : " AND (term_id = :term OR term_id IS NULL)")
                + " ORDER BY source_type, source_id, (status = 'OPEN') DESC, opened_at DESC, id DESC";
        // Open first, the most serious first, the oldest first; then the latest handled.
        List<Row> rows = jdbc.sql(sql).params(params).query(EscalationService::row).list().stream()
                .sorted(Comparator.comparing((Row r) -> !r.status().equals("OPEN"))
                        .thenComparing(r -> !r.tone().equals("DANGER"))
                        .thenComparing(r -> r.status().equals("OPEN") ? r.openedAt().toEpochMilli()
                                : -r.handledAt().toEpochMilli())
                        .thenComparing(Row::id))
                .toList();

        Map<Long, List<Event>> timeline = new HashMap<>();
        if (!rows.isEmpty()) {
            jdbc.sql("SELECT escalation_id, text, at FROM req_escalation_event WHERE escalation_id IN (:ids) ORDER BY at DESC, id DESC")
                    .param("ids", rows.stream().map(Row::id).toList())
                    .query((rs, i) -> Map.entry(rs.getLong("escalation_id"),
                            new Event(rs.getString("text"), rs.getTimestamp("at").toInstant())))
                    .list().forEach(e -> timeline.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        }
        List<UserDirectory.StaffMember> staff = users.staffOf(buildings);
        Map<Long, List<UserDirectory.StaffMember>> staffByBlock = new HashMap<>();
        Map<Long, String> names = users.displayNames(rows.stream().map(Row::ownerId).filter(Objects::nonNull).toList());
        Map<String, Map<Long, Long>> load = rows.stream().anyMatch(r -> r.status().equals("OPEN")) ? load(buildings)
                : Map.of();

        List<Item> items = rows.stream().map(r -> {
            boolean isOpen = r.status().equals("OPEN");
            boolean change = r.sourceType().equals(ROOM_CHANGE);
            Handled handled = isOpen ? null : new Handled(handledLabel(r, names), r.handledAt(), r.handledNote());
            Instant start = r.sourceAt() != null ? r.sourceAt() : r.openedAt();
            return new Item(r.sourceCode(), change ? "room-change" : "maintenance", r.title(), r.subtitle(), r.room(),
                    r.why(), TONES.get(r.tone()), age(Duration.between(start, isOpen ? now : r.handledAt())),
                    r.ownerId() == null ? null : names.get(r.ownerId()), handled,
                    timeline.getOrDefault(r.id(), List.of()),
                    isOpen ? suggest(r, staffByBlock.computeIfAbsent(r.buildingId(), b -> users.staffOf(List.of(b))),
                            load.getOrDefault(r.sourceType(), Map.of())) : null, r.link(),
                    isOpen && change);
        }).toList();
        return new Page(items, staff.stream().map(m -> new Assignee(String.valueOf(m.userId()), m.name())).toList());
    }

    // ---------------------------------------------------------------- actions

    /** {@code reassign} (with {@code assigneeId}) or {@code temporary-bed} (Room-Change Requests); closes the escalation. */
    @Transactional
    public void act(String id, String action, Object assigneeId, String note) {
        currentUser.require(Permission.MANAGE_BLOCK);
        Row e = find(id);
        blockScope.check(e.buildingId());
        if (!e.status().equals("OPEN")) {
            throw ApiException.conflict("ESCALATION_HANDLED", "This escalation was already handled.");
        }
        String text = note == null || note.isBlank() ? null : note.trim();
        if (text != null && text.length() > 1000) {
            throw FieldErrors.single("note", "Keep the note under 1,000 characters.");
        }
        Instant now = Instant.now(clock);
        String kind = action == null ? "" : action.trim();
        if (kind.equals("reassign")) {
            long assignee = staffOf(e.buildingId(), assigneeId);
            String name = users.displayNames(List.of(assignee)).get(assignee);
            if (e.sourceType().equals(MAINTENANCE)) {
                maintenance.assign(e.sourceId(), assignee, "escalation");
            } else {
                int changed = jdbc.sql("""
                        UPDATE req_room_change SET assignee_id = :a, version = version + 1
                        WHERE id = :id AND status IN ('SUBMITTED', 'PENDING')
                        """).param("a", assignee).param("id", e.sourceId()).update();
                if (changed == 0) {
                    throw ApiException.conflict("REQUEST_CLOSED", "This request is no longer open.");
                }
            }
            handle(e, "REASSIGN", assignee, text, now);
            event(e.id(), "Reassigned to " + name, now);
            audit.record("ESCALATION_REASSIGNED", AuditLog.Tone.INFO, "Escalation", e.id(), e.sourceCode(),
                    Map.of("assignee", name));
            events.publishEvent(new EscalationAssigned(e.id(), assignee, e.sourceCode(), e.title(),
                    e.sourceType().equals(MAINTENANCE) ? "/staff/maintenance/" + e.sourceCode() : "/staff/room-changes"));
        } else if (kind.equals("temporary-bed")) {
            if (!e.sourceType().equals(ROOM_CHANGE)) {
                throw FieldErrors.single("action", "A temporary Bed can only be offered for a Room-Change Request.");
            }
            handle(e, "TEMPORARY_BED", e.ownerId(), text, now);
            event(e.id(), "Temporary Bed offered", now);
            audit.record("ESCALATION_TEMPORARY_BED", AuditLog.Tone.INFO, "Escalation", e.id(), e.sourceCode(), null);
        } else {
            throw FieldErrors.single("action", "Choose reassign or temporary-bed.");
        }
    }

    // ---------------------------------------------------------------- helpers

    private Row find(String id) {
        String value = id == null ? "" : id.trim();
        List<Row> rows = jdbc.sql("""
                SELECT * FROM req_escalation WHERE upper(source_code) = upper(:code)
                ORDER BY (status = 'OPEN') DESC, opened_at DESC, id DESC LIMIT 1 FOR UPDATE
                """).param("code", value).query(EscalationService::row).list();
        if (rows.isEmpty()) {
            throw ApiException.notFound("This escalation does not exist.");
        }
        return rows.getFirst();
    }

    private void handle(Row e, String action, Long owner, String note, Instant now) {
        jdbc.sql("""
                UPDATE req_escalation SET status = 'HANDLED', handled_action = :action, handled_at = :now,
                       handled_by = :by, handled_note = :note, owner_id = :owner, version = version + 1
                WHERE id = :id
                """)
                .param("action", action).param("now", Timestamp.from(now)).param("by", currentUser.id())
                .param("note", note).param("owner", owner).param("id", e.id()).update();
    }

    private void event(long escalationId, String text, Instant at) {
        jdbc.sql("INSERT INTO req_escalation_event (escalation_id, text, at) VALUES (:e, :text, :at)")
                .param("e", escalationId).param("text", cut(text, 300)).param("at", Timestamp.from(at)).update();
    }

    private long staffOf(long building, Object value) {
        String text = value == null ? "" : String.valueOf(value).trim();
        long id = text.isEmpty() || text.length() > 18 || !text.chars().allMatch(Character::isDigit) ? -1
                : Long.parseLong(text);
        if (users.staffOf(List.of(building)).stream().noneMatch(m -> m.userId() == id)) {
            throw FieldErrors.single("assigneeId", "Choose someone from this Block's staff.");
        }
        return id;
    }

    /** Open work per assignee: Maintenance Requests and undecided Room-Change Requests. */
    private Map<String, Map<Long, Long>> load(Set<Long> buildings) {
        Map<Long, Long> repairs = maintenance.open(buildings).stream()
                .map(MaintenanceRequests.OpenRequest::assigneeId).filter(Objects::nonNull)
                .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));
        Map<Long, Long> changes = jdbc.sql("""
                SELECT assignee_id, count(*) AS n FROM req_room_change
                WHERE building_id IN (:b) AND status IN ('SUBMITTED', 'PENDING') AND assignee_id IS NOT NULL
                GROUP BY assignee_id
                """).param("b", List.copyOf(buildings))
                .query((rs, i) -> Map.entry(rs.getLong("assignee_id"), rs.getLong("n"))).list().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
        return Map.of(MAINTENANCE, repairs, ROOM_CHANGE, changes);
    }

    /** On-duty staff of the request's Block who handle this kind of request, the least busy first; never the owner. */
    private static String suggest(Row r, List<UserDirectory.StaffMember> blockStaff, Map<Long, Long> load) {
        String handle = r.sourceType().equals(MAINTENANCE) ? "MAINTENANCE" : "ROOM_CHANGES";
        return blockStaff.stream()
                .filter(m -> m.onDuty() && m.handles().contains(handle) && !Objects.equals(m.userId(), r.ownerId()))
                .min(Comparator.comparing((UserDirectory.StaffMember m) -> load.getOrDefault(m.userId(), 0L))
                        .thenComparing(UserDirectory.StaffMember::name))
                .map(m -> String.valueOf(m.userId())).orElse(null);
    }

    private static String handledLabel(Row r, Map<Long, String> names) {
        return switch (r.handledAction()) {
            case "REASSIGN" -> "Reassigned to " + (r.ownerId() == null ? "another staff member" : names.get(r.ownerId()));
            case "TEMPORARY_BED" -> "Temporary Bed offered";
            default -> "Closed automatically";
        };
    }

    private String label(String list, String code) {
        return code == null ? "" : lookups.find(list, code).map(Lookups.Lookup::label).orElse(code);
    }

    private static String hours(long h) {
        return h + (h == 1 ? " hour" : " hours");
    }

    /** {@code 45 min}, {@code 5 h 20 min}, {@code 3 days}. */
    static String age(Duration d) {
        long minutes = Math.max(0, d.toMinutes());
        if (minutes < 60) {
            return minutes + " min";
        }
        if (minutes < 48 * 60) {
            return minutes / 60 + " h" + (minutes % 60 == 0 ? "" : " " + minutes % 60 + " min");
        }
        return minutes / (24 * 60) + " days";
    }

    private static String cut(String text, int max) {
        return text == null || text.length() <= max ? text : text.substring(0, max - 1) + "…";
    }

    private static Row row(ResultSet rs, int i) throws SQLException {
        Timestamp sourceAt = rs.getTimestamp("source_at");
        Timestamp handledAt = rs.getTimestamp("handled_at");
        return new Row(rs.getLong("id"), rs.getLong("building_id"), rs.getObject("term_id", Long.class),
                rs.getString("kind"), rs.getString("source_type"), rs.getLong("source_id"), rs.getString("source_code"),
                sourceAt == null ? null : sourceAt.toInstant(), rs.getString("title"), rs.getString("subtitle"),
                rs.getString("room_code"), rs.getString("why"), rs.getString("tone"), rs.getObject("owner_id", Long.class),
                rs.getString("status"), rs.getTimestamp("opened_at").toInstant(), rs.getString("handled_action"),
                handledAt == null ? null : handledAt.toInstant(), rs.getString("handled_note"), rs.getString("link"));
    }

    private static RoomChange roomChange(ResultSet rs, int i) throws SQLException {
        Timestamp due = rs.getTimestamp("sla_due_at");
        return new RoomChange(rs.getLong("id"), rs.getString("code"), rs.getLong("term_id"), rs.getLong("student_id"),
                rs.getLong("allocation_id"), rs.getLong("building_id"), rs.getString("kind"), rs.getString("reason_code"),
                rs.getObject("assignee_id", Long.class), due == null ? null : due.toInstant(),
                rs.getTimestamp("submitted_at").toInstant());
    }
}
