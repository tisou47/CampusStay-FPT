package vn.fpt.campusstay.service.request;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.StaffWorkload;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.setting.Lookups;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * Routing rules and escalation timers of a Block (Block Manager). A new
 * request of a type (and, for maintenance, a category) goes to the rule's
 * assignee, or to its fallback while the assignee is off duty. Timers may only
 * be stricter than the Admin limits (System parameters {@code sla.*}).
 */
@Service
public class RoutingService {

    public record RuleView(String id, String type, String scope, String condition, String assigneeId,
            String assigneeName, String fallbackId, String fallbackName, boolean active) {
    }

    /**
     * A staff member of the Block with their workload (spec §6.18): open items (Maintenance Requests, requests to
     * decide) and items finished in the last 7 days.
     */
    public record StaffOption(String id, String name, boolean onDuty, long open, long resolvedWeek) {
    }

    public record Gap(String ruleId, String title, String message) {
    }

    /** Each value is a label such as {@code 4 hours}. */
    public record Timers(String urgent, String normal, String roomChange) {
    }

    public record TimerOptions(List<String> urgent, List<String> normal, List<String> roomChange) {
    }

    public record Page(List<RuleView> rules, List<StaffOption> staff, List<String> types, List<String> categories,
            List<Gap> gaps, Timers timers, TimerOptions timerOptions) {
    }

    public record Created(String id) {
    }

    /** Hours a request may stay open (urgent, normal maintenance) and a Room change undecided. */
    record Sla(int urgent, int normal, int roomChange) {
    }

    private record Rule(long id, long buildingId, String type, String scope, String condition, long assigneeId,
            Long fallbackId, boolean active, int sortOrder) {
    }

    static final String ALL = "ALL";
    private static final Map<String, String> TYPES = new LinkedHashMap<>();

    static {
        TYPES.put("MAINTENANCE", "Maintenance");
        TYPES.put("ROOM_CHANGE", "Room change");
        TYPES.put("SWAP", "Swap");
        TYPES.put("PAYMENT", "Payment");
        TYPES.put("LATE_CHECK_IN", "Late check-in");
    }

    private static final List<Integer> URGENT = List.of(1, 2, 4, 8, 12);
    private static final List<Integer> NORMAL = List.of(12, 24, 48, 72, 96);
    private static final List<Integer> ROOM_CHANGE = List.of(24, 48, 72, 96, 120);

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final UserDirectory users;
    private final Lookups lookups;
    private final Parameters parameters;
    private final AuditLog audit;
    private final List<StaffWorkload> workloads;
    private final Clock clock;

    public RoutingService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, UserDirectory users,
            Lookups lookups, Parameters parameters, AuditLog audit, List<StaffWorkload> workloads, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.users = users;
        this.lookups = lookups;
        this.parameters = parameters;
        this.audit = audit;
        this.workloads = workloads;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- screen

    @Transactional(readOnly = true)
    public Page page(String block) {
        currentUser.require(Permission.MANAGE_BLOCK);
        long building = building(block);
        List<Rule> rules = rules(building);
        List<UserDirectory.StaffMember> staff = users.staffOf(List.of(building));
        Map<Long, UserDirectory.StaffMember> byId = staff.stream()
                .collect(Collectors.toMap(UserDirectory.StaffMember::userId, m -> m));
        Map<Long, String> names = users.displayNames(rules.stream()
                .flatMap(r -> Stream.of(r.assigneeId(), r.fallbackId())).filter(Objects::nonNull).toList());
        List<Gap> gaps = new ArrayList<>();
        for (Rule r : rules.stream().filter(Rule::active).toList()) {
            UserDirectory.StaffMember a = byId.get(r.assigneeId());
            UserDirectory.StaffMember f = r.fallbackId() == null ? null : byId.get(r.fallbackId());
            String what = TYPES.get(r.type()) + " · " + scopeLabel(r.scope());
            if (a == null) {
                gaps.add(new Gap(String.valueOf(r.id()), what, names.get(r.assigneeId())
                        + " no longer works in this Block. Choose another assignee."));
            } else if (!a.onDuty() && (f == null || !f.onDuty())) {
                gaps.add(new Gap(String.valueOf(r.id()), what, a.name() + " is off duty today"
                        + (f == null ? " and the rule has no fallback." : " and so is the fallback.")));
            }
        }
        for (String type : List.of("MAINTENANCE", "ROOM_CHANGE")) {
            boolean covered = rules.stream().anyMatch(r -> r.active() && r.type().equals(type) && r.scope().equals(ALL));
            if (!covered) {
                gaps.add(new Gap(null, TYPES.get(type) + " · All", "New " + TYPES.get(type).toLowerCase(Locale.ROOT)
                        + " requests without a matching rule wait unassigned in the queue."));
            }
        }
        Map<Long, long[]> load = new HashMap<>();
        List<Long> staffIds = staff.stream().map(UserDirectory.StaffMember::userId).toList();
        Instant weekAgo = Instant.now(clock).minus(java.time.Duration.ofDays(7));
        for (StaffWorkload w : workloads) {
            w.workload(staffIds, weekAgo).forEach((id, l) -> {
                long[] sum = load.computeIfAbsent(id, k -> new long[2]);
                sum[0] += l.open();
                sum[1] += l.resolved();
            });
        }
        Sla sla = sla(building);
        List<String> categories = new ArrayList<>();
        categories.add("All");
        lookups.list("MAINTENANCE_CATEGORY").forEach(l -> categories.add(l.label()));
        return new Page(
                rules.stream().map(r -> new RuleView(String.valueOf(r.id()), TYPES.get(r.type()), scopeLabel(r.scope()),
                        r.condition(), String.valueOf(r.assigneeId()), names.get(r.assigneeId()),
                        r.fallbackId() == null ? null : String.valueOf(r.fallbackId()),
                        r.fallbackId() == null ? null : names.get(r.fallbackId()), r.active())).toList(),
                staff.stream().map(m -> {
                    long[] l = load.getOrDefault(m.userId(), new long[2]);
                    return new StaffOption(String.valueOf(m.userId()), m.name(), m.onDuty(), l[0], l[1]);
                }).toList(),
                List.copyOf(TYPES.values()), categories, gaps,
                new Timers(hours(sla.urgent()), hours(sla.normal()), hours(sla.roomChange())),
                new TimerOptions(options(URGENT, "sla.urgent_max_hours"), options(NORMAL, "sla.normal_max_hours"),
                        options(ROOM_CHANGE, "sla.room_change_max_hours")));
    }

    // ---------------------------------------------------------------- changes

    /** {@code block}, {@code type}, {@code scope} (a category or All), {@code condition}, {@code assigneeId}, {@code fallbackId}. */
    @Transactional
    public Created create(Map<String, Object> body) {
        currentUser.require(Permission.MANAGE_BLOCK);
        long building = building(text(body.get("block")));
        String type = type(text(body.get("type")));
        String scope = scope(type, text(body.get("scope")));
        long assignee = staffId(building, body.get("assigneeId"), "assigneeId", true);
        Long fallback = body.get("fallbackId") == null || text(body.get("fallbackId")).isBlank() ? null
                : staffId(building, body.get("fallbackId"), "fallbackId", false);
        if (fallback != null && fallback == assignee) {
            throw FieldErrors.single("fallbackId", "Choose a fallback other than the assignee.");
        }
        long id = jdbc.sql("""
                INSERT INTO req_routing_rule (building_id, request_type, scope, condition, assignee_id, fallback_id, active,
                                              sort_order, updated_at)
                VALUES (:b, :type, :scope, :condition, :assignee, :fallback, :active,
                        (SELECT coalesce(max(sort_order), 0) + 1 FROM req_routing_rule WHERE building_id = :b), :now)
                RETURNING id
                """)
                .param("b", building).param("type", type).param("scope", scope).param("condition", condition(body))
                .param("assignee", assignee).param("fallback", fallback)
                .param("active", !Boolean.FALSE.equals(body.get("active"))).param("now", Timestamp.from(Instant.now(clock)))
                .query(Long.class).single();
        audit.record("ROUTING_RULE_ADDED", AuditLog.Tone.INFO, "Routing rule", id,
                TYPES.get(type) + " · " + scopeLabel(scope), null);
        return new Created(String.valueOf(id));
    }

    /** Only the fields sent change; {@code "fallbackId": null} removes the fallback. */
    @Transactional
    public void update(String id, Map<String, Object> body) {
        currentUser.require(Permission.MANAGE_BLOCK);
        Rule r = parse(id).flatMap(n -> jdbc.sql("SELECT * FROM req_routing_rule WHERE id = :id FOR UPDATE")
                .param("id", n).query(RoutingService::rule).optional())
                .orElseThrow(() -> ApiException.notFound("This routing rule does not exist."));
        blockScope.check(r.buildingId());
        String type = body.containsKey("type") ? type(text(body.get("type"))) : r.type();
        String scope = body.containsKey("scope") ? scope(type, text(body.get("scope"))) : r.scope();
        long assignee = body.containsKey("assigneeId") ? staffId(r.buildingId(), body.get("assigneeId"), "assigneeId", true)
                : r.assigneeId();
        Long fallback = !body.containsKey("fallbackId") ? r.fallbackId()
                : body.get("fallbackId") == null || text(body.get("fallbackId")).isBlank() ? null
                        : staffId(r.buildingId(), body.get("fallbackId"), "fallbackId", false);
        if (fallback != null && fallback == assignee) {
            throw FieldErrors.single("fallbackId", "Choose a fallback other than the assignee.");
        }
        boolean active = body.containsKey("active") ? !Boolean.FALSE.equals(body.get("active")) : r.active();
        jdbc.sql("""
                UPDATE req_routing_rule SET request_type = :type, scope = :scope, condition = :condition,
                       assignee_id = :assignee, fallback_id = :fallback, active = :active, updated_at = :now,
                       version = version + 1
                WHERE id = :id
                """)
                .param("type", type).param("scope", scope)
                .param("condition", body.containsKey("condition") ? condition(body) : r.condition())
                .param("assignee", assignee).param("fallback", fallback).param("active", active)
                .param("now", Timestamp.from(Instant.now(clock))).param("id", r.id()).update();
        audit.record("ROUTING_RULE_UPDATED", AuditLog.Tone.INFO, "Routing rule", r.id(),
                TYPES.get(type) + " · " + scopeLabel(scope), Map.of("active", active));
    }

    /** Values are labels ({@code 4 hours}) or whole hours, at most the Admin limit. */
    @Transactional
    public void saveTimers(String block, Object urgent, Object normal, Object roomChange) {
        currentUser.require(Permission.MANAGE_BLOCK);
        long building = building(block);
        FieldErrors errors = new FieldErrors();
        Integer u = timer(errors, "urgent", urgent, URGENT, "sla.urgent_max_hours");
        Integer n = timer(errors, "normal", normal, NORMAL, "sla.normal_max_hours");
        Integer rc = timer(errors, "roomChange", roomChange, ROOM_CHANGE, "sla.room_change_max_hours");
        errors.throwIfAny();
        jdbc.sql("""
                INSERT INTO req_sla_policy (building_id, urgent_hours, normal_hours, room_change_hours, updated_at, updated_by)
                VALUES (:b, :u, :n, :rc, :now, :by)
                ON CONFLICT (building_id) DO UPDATE SET urgent_hours = EXCLUDED.urgent_hours,
                       normal_hours = EXCLUDED.normal_hours, room_change_hours = EXCLUDED.room_change_hours,
                       updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
                """)
                .param("b", building).param("u", u).param("n", n).param("rc", rc)
                .param("now", Timestamp.from(Instant.now(clock))).param("by", currentUser.get().userId()).update();
        audit.record("ESCALATION_TIMERS_UPDATED", AuditLog.Tone.INFO, "Block", building, "Escalation timers",
                Map.of("urgent", u, "normal", n, "roomChange", rc));
    }

    // ---------------------------------------------------------------- used by Requests

    /**
     * Who gets a new request: the most specific active rule (category first, then All), its assignee while on
     * duty, else its fallback when on duty, else the assignee anyway.
     */
    Optional<Long> route(String type, long buildingId, String category) {
        Map<Long, UserDirectory.StaffMember> staff = users.staffOf(List.of(buildingId)).stream()
                .collect(Collectors.toMap(UserDirectory.StaffMember::userId, m -> m));
        return rules(buildingId).stream()
                .filter(r -> r.active() && r.type().equals(type)
                        && (r.scope().equals(ALL) || (category != null && r.scope().equals(category))))
                .sorted(Comparator.comparing((Rule r) -> r.scope().equals(ALL)).thenComparing(Rule::sortOrder))
                .map(r -> {
                    UserDirectory.StaffMember a = staff.get(r.assigneeId());
                    UserDirectory.StaffMember f = r.fallbackId() == null ? null : staff.get(r.fallbackId());
                    if (a != null && a.onDuty()) {
                        return a.userId();
                    }
                    if (f != null && f.onDuty()) {
                        return f.userId();
                    }
                    return a != null ? a.userId() : f != null ? f.userId() : null;
                })
                .filter(Objects::nonNull).findFirst();
    }

    /** The Block's timers, or the Admin limits when the Block has none. */
    Sla sla(long buildingId) {
        return jdbc.sql("SELECT urgent_hours, normal_hours, room_change_hours FROM req_sla_policy WHERE building_id = :b")
                .param("b", buildingId)
                .query((rs, i) -> new Sla(rs.getInt("urgent_hours"), rs.getInt("normal_hours"),
                        rs.getInt("room_change_hours")))
                .optional()
                .orElseGet(() -> new Sla(parameters.intValue("sla.urgent_max_hours"),
                        parameters.intValue("sla.normal_max_hours"), parameters.intValue("sla.room_change_max_hours")));
    }

    // ---------------------------------------------------------------- helpers

    private List<Rule> rules(long building) {
        return jdbc.sql("SELECT * FROM req_routing_rule WHERE building_id = :b ORDER BY request_type, sort_order, id")
                .param("b", building).query(RoutingService::rule).list();
    }

    private long building(String block) {
        BlockSelection selection = blockScope.resolve(block);
        if (!selection.single()) {
            throw FieldErrors.single("block", "Choose a Block.");
        }
        return selection.singleId();
    }

    private String type(String label) {
        return TYPES.entrySet().stream().filter(e -> e.getValue().equalsIgnoreCase(label) || e.getKey().equalsIgnoreCase(label))
                .map(Map.Entry::getKey).findFirst()
                .orElseThrow(() -> FieldErrors.single("type", "Choose a request type."));
    }

    private String scope(String type, String label) {
        if (label == null || label.isBlank() || label.equalsIgnoreCase("All")) {
            return ALL;
        }
        if (!type.equals("MAINTENANCE")) {
            throw FieldErrors.single("scope", "Only maintenance rules can be limited to a category.");
        }
        return lookups.find("MAINTENANCE_CATEGORY", label).map(Lookups.Lookup::code)
                .orElseThrow(() -> FieldErrors.single("scope", "Choose a category from the list."));
    }

    private String scopeLabel(String scope) {
        return scope.equals(ALL) ? "All" : lookups.find("MAINTENANCE_CATEGORY", scope).map(Lookups.Lookup::label)
                .orElse(scope);
    }

    private long staffId(long building, Object value, String field, boolean required) {
        Long id = parse(text(value)).orElse(null);
        if (id == null || users.staffOf(List.of(building)).stream().noneMatch(m -> m.userId() == id)) {
            throw FieldErrors.single(field, required ? "Choose an assignee from this Block's staff."
                    : "Choose a fallback from this Block's staff.");
        }
        return id;
    }

    private static String condition(Map<String, Object> body) {
        String text = text(body.get("condition"));
        if (text.length() > 100) {
            throw FieldErrors.single("condition", "Keep the condition under 100 characters.");
        }
        return text.isBlank() ? null : text.trim();
    }

    private Integer timer(FieldErrors errors, String field, Object value, List<Integer> choices, String limit) {
        Integer hours = parse(text(value).replaceAll("(?i)\\s*hours?$", "")).map(Long::intValue).orElse(null);
        int max = parameters.intValue(limit);
        errors.check(hours != null && choices.contains(hours) && hours <= max, field,
                "Choose one of the listed times (at most " + max + " hours).");
        return hours;
    }

    private List<String> options(List<Integer> choices, String limit) {
        int max = parameters.intValue(limit);
        return choices.stream().filter(h -> h <= max).map(RoutingService::hours).toList();
    }

    private static String hours(int h) {
        return h + (h == 1 ? " hour" : " hours");
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static Optional<Long> parse(String value) {
        if (value == null || value.isBlank() || value.length() > 18 || !value.chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(value));
    }

    private static Rule rule(ResultSet rs, int i) throws SQLException {
        return new Rule(rs.getLong("id"), rs.getLong("building_id"), rs.getString("request_type"), rs.getString("scope"),
                rs.getString("condition"), rs.getLong("assignee_id"), rs.getObject("fallback_id", Long.class),
                rs.getBoolean("active"), rs.getInt("sort_order"));
    }
}
