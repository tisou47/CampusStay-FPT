package vn.fpt.campusstay.service.auth;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.AuthProperties;
import vn.fpt.campusstay.event.WorkReassigned;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * Manager › Staff and workload: who works in the Block, what each person handles (routing uses it), who is on duty,
 * how much open work each person holds (by kind, late, oldest), what waits for the Block with nobody in charge, and
 * moving one person's open work to someone else. Name, email and role stay with Admin; the Manager asks Admin for new
 * accounts.
 */
@Service
public class BlockStaffService {

    /**
     * @param handles      labels of the {@code STAFF_HANDLE} list; {@code blocks} Block codes
     * @param openByType   open items per kind label (Maintenance, Room change, Inspection), every kind listed
     * @param oldestOpenAt when the person's oldest open item was opened, or null
     * @param overloaded   more open items than {@code workload.max_open_per_staff} (display only)
     */
    public record Item(String id, String name, String title, List<String> handles, List<String> blocks, long open,
            Map<String, Long> openByType, long overdue, Instant oldestOpenAt, long resolved7d, boolean onDuty,
            boolean overloaded, List<StaffShifts.Shift> shifts, boolean inShift, String role,
            List<StaffShifts.Shift> weekShifts) {
    }

    /** @param open open items of everyone listed; {@code maxOpen} the overload limit */
    public record Summary(int total, int shared, Double averageOpen, int onDuty, int deskOnDuty, long open,
            long overdue, int overloaded, int maxOpen) {
    }

    /** Work waiting for the Block with nobody in charge yet. */
    public record QueueLine(String type, String label, long count, String link) {
    }

    public record Page(List<Item> items, Summary summary, List<QueueLine> queue, List<String> handleOptions,
            List<String> roleOptions) {
    }

    public record Created(String id) {
    }

    /** @param open requests assigned now; {@code resolved7d} resolved in the last 7 days */
    public record Me(String id, boolean onDuty, List<String> handles, List<String> blocks, long open, long resolved7d,
            boolean inShift, String shiftToday, List<StaffShifts.Shift> shifts) {
    }

    /**
     * One open item of a person.
     *
     * @param type its kind's label (Maintenance, Room change, Inspection); {@code id} what reassign takes
     */
    public record WorkItem(String type, String id, String code, String title, String roomCode, String status,
            Instant openedAt, Instant dueAt, boolean overdue, String link) {
    }

    public record WorkPage(List<WorkItem> items, long total) {
    }

    /** An item to move: its kind (label or code) and id. */
    public record WorkRef(String type, String id) {
    }

    public record Moved(int moved) {
    }

    private record Person(long id, String name, Role role, String title, List<String> handles, boolean onDuty) {
    }

    private static final Duration RESOLVED_WINDOW = Duration.ofDays(7);
    private static final List<Role> ROLES = List.of(Role.STAFF, Role.MANAGER);
    private static final int MAX_NOTE = 300;
    private static final int MAX_ITEMS = 100;
    /** Kinds of work in column order, with their labels and the handle (request type) a receiver needs. */
    private static final Map<String, String> TYPE_LABELS = labels();
    private static final Map<String, String> TYPE_HANDLES = Map.of(StaffWorkload.MAINTENANCE, "MAINTENANCE",
            StaffWorkload.ROOM_CHANGE, "ROOM_CHANGES", StaffWorkload.INSPECTION, "INSPECTIONS");
    private static final Map<String, String[]> QUEUES = Map.of(
            BlockQueues.SWAP_WAITING_STAFF, new String[] { "Swaps waiting for Staff", "/manager/room-changes/swaps" },
            BlockQueues.NEXT_TERM_WAITING, new String[] { "Next-Term requests to decide", "/manager/next-term/requests" });

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blocks;
    private final StaffHandles handles;
    private final List<StaffWorkload> workloads;
    private final List<BlockQueues> queues;
    private final List<StaffWork> work;
    private final Parameters parameters;
    private final AuthProperties properties;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;
    private final StaffShifts shifts;

    public BlockStaffService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, BlockDirectory blocks,
            StaffHandles handles, List<StaffWorkload> workloads, List<BlockQueues> queues, List<StaffWork> work,
            Parameters parameters, AuthProperties properties, ApplicationEventPublisher events, AuditLog audit,
            Clock clock, StaffShifts shifts) {
        this.shifts = shifts;
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blocks = blocks;
        this.handles = handles;
        this.workloads = workloads;
        this.queues = queues;
        this.work = work;
        this.parameters = parameters;
        this.properties = properties;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    private static Map<String, String> labels() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put(StaffWorkload.MAINTENANCE, "Maintenance");
        m.put(StaffWorkload.ROOM_CHANGE, "Room change");
        m.put(StaffWorkload.INSPECTION, "Inspection");
        return m;
    }

    // ---------------------------------------------------------------- list

    /** The Block's staff with their workload, the most loaded first, and the Block's queue. */
    @Transactional(readOnly = true)
    public Page list(String block) {
        currentUser.require(Permission.MANAGE_BLOCK);
        BlockSelection selection = blockScope.resolve(block);
        List<Person> people = jdbc.sql("""
                SELECT DISTINCT u.id, u.display_name, u.role, u.title, coalesce(p.handles, '{}') AS handles,
                       coalesce(p.on_duty, FALSE) AS on_duty
                FROM auth_user u
                JOIN auth_user_block b ON b.user_id = u.id
                LEFT JOIN auth_staff_profile p ON p.user_id = u.id
                WHERE b.building_id IN (:b) AND u.role IN ('STAFF', 'MANAGER') AND u.status = 'ACTIVE'
                ORDER BY u.display_name, u.id
                """).param("b", List.copyOf(selection.ids()))
                .query((rs, i) -> new Person(rs.getLong("id"), rs.getString("display_name"),
                        Role.valueOf(rs.getString("role")), rs.getString("title"),
                        List.of((String[]) rs.getArray("handles").getArray()), rs.getBoolean("on_duty")))
                .list();
        List<Long> ids = people.stream().map(Person::id).toList();
        Map<Long, List<String>> blockCodes = blockCodes(ids);
        Map<Long, StaffWorkload.Load> load = load(ids);
        int maxOpen = parameters.intValue("workload.max_open_per_staff");
        Map<String, String> labels = handles.labels();
        Map<Long, List<StaffShifts.Shift>> shiftsOf = shifts.of(ids);
        Map<Long, List<StaffShifts.Shift>> thisWeek = shifts.forWeek(ids, StaffShifts.mondayOf(shifts.now().toLocalDate()));
        Map<Long, StaffShifts.Now> nowOf = shifts.nowOf(ids);
        List<Item> items = people.stream().map(p -> {
            StaffWorkload.Load l = load.getOrDefault(p.id(), StaffWorkload.Load.NONE);
            Map<String, Long> byType = new LinkedHashMap<>();
            TYPE_LABELS.forEach((code, label) -> byType.put(label, l.openByType().getOrDefault(code, 0L)));
            List<StaffShifts.Shift> mine = shiftsOf.getOrDefault(p.id(), List.of());
            return new Item(String.valueOf(p.id()), p.name(),
                    p.title() != null ? p.title() : AdminUserService.roleLabel(p.role()),
                    p.handles().stream().map(h -> labels.getOrDefault(h, h)).toList(),
                    blockCodes.getOrDefault(p.id(), List.of()), l.open(), byType, l.overdue(), l.oldestOpenAt(),
                    l.resolved(), p.onDuty(), l.open() > maxOpen, mine, nowOf.get(p.id()).inShift(),
                    AdminUserService.roleLabel(p.role()), thisWeek.getOrDefault(p.id(), List.of()));
        }).sorted(Comparator.comparingLong(Item::open).reversed().thenComparing(Item::name)
                .thenComparing(Item::id)).toList();
        Double averageOpen = items.isEmpty() ? null
                : Math.round(items.stream().mapToLong(Item::open).average().orElse(0) * 10) / 10.0;
        Summary summary = new Summary(items.size(), (int) items.stream().filter(i -> i.blocks().size() > 1).count(),
                averageOpen, (int) items.stream().filter(Item::onDuty).count(),
                (int) people.stream().filter(p -> p.onDuty() && p.handles().contains("DESK")).count(),
                items.stream().mapToLong(Item::open).sum(), items.stream().mapToLong(Item::overdue).sum(),
                (int) items.stream().filter(Item::overloaded).count(), maxOpen);
        return new Page(items, summary, queue(selection.ids()), List.copyOf(labels.values()),
                ROLES.stream().map(AdminUserService::roleLabel).toList());
    }

    private Map<Long, StaffWorkload.Load> load(List<Long> ids) {
        Map<Long, StaffWorkload.Load> load = new HashMap<>();
        Instant since = Instant.now(clock).minus(RESOLVED_WINDOW);
        for (StaffWorkload w : workloads) {
            w.workload(ids, since).forEach((id, l) -> load.merge(id, l, StaffWorkload.Load::plus));
        }
        return load;
    }

    private List<QueueLine> queue(Set<Long> buildingIds) {
        Map<String, Long> waiting = new HashMap<>();
        for (BlockQueues q : queues) {
            q.waiting(buildingIds).forEach((type, n) -> waiting.merge(type, n, Long::sum));
        }
        return QUEUES.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .map(e -> new QueueLine(e.getKey(), e.getValue()[0], waiting.getOrDefault(e.getKey(), 0L),
                        e.getValue()[1]))
                .toList();
    }

    // ---------------------------------------------------------------- handles and duty

    /**
     * Changes what the person handles ({@code handles}: labels or codes). Duty is not set here: it follows the
     * person's sign-in and sign-out ({@link DutyPresence}).
     */
    @Transactional
    public void update(String id, List<String> newHandles) {
        currentUser.require(Permission.MANAGE_BLOCK);
        Person p = person(id, true);
        if (newHandles == null) {
            return;
        }
        Map<String, String> labels = handles.labels();
        List<String> chosen = new ArrayList<>();
        for (String h : newHandles) {
            String code = h == null ? null : labels.entrySet().stream()
                    .filter(e -> e.getKey().equalsIgnoreCase(h.trim()) || e.getValue().equalsIgnoreCase(h.trim()))
                    .map(Map.Entry::getKey).findFirst().orElse(null);
            if (code == null) {
                throw FieldErrors.single("handles", "Choose what the person handles from the list.");
            }
            if (!chosen.contains(code)) {
                chosen.add(code);
            }
        }
        // Keep the list's order.
        List<String> codes = labels.keySet().stream().filter(chosen::contains).toList();
        jdbc.sql("""
                INSERT INTO auth_staff_profile (user_id, handles, on_duty) VALUES (:id, :handles, FALSE)
                ON CONFLICT (user_id) DO UPDATE SET handles = EXCLUDED.handles
                """).param("id", p.id()).param("handles", codes.toArray(String[]::new)).update();
        if (!codes.equals(p.handles())) {
            audit.record("STAFF_PROFILE_UPDATED", AuditLog.Tone.INFO, "User", p.id(), p.name(),
                    Map.of("handles", Arrays.asList(labelList(p.handles(), labels), labelList(codes, labels))));
        }
    }

    /** The signed-in Staff member's or Manager's own duty, request types and workload (A-60). */
    @Transactional(readOnly = true)
    public Me me() {
        AuthenticatedUser user = currentUser.require(Role.STAFF, Role.MANAGER);
        return me(self(user.userId(), false));
    }

    private Me me(Person p) {
        StaffWorkload.Load l = load(List.of(p.id())).getOrDefault(p.id(), StaffWorkload.Load.NONE);
        Map<String, String> labels = handles.labels();
        List<StaffShifts.Shift> week = shifts.forWeek(List.of(p.id()), StaffShifts.mondayOf(shifts.now().toLocalDate()))
                .getOrDefault(p.id(), List.of());
        StaffShifts.Now now = shifts.nowOf(p.id());
        return new Me(String.valueOf(p.id()), p.onDuty(), p.handles().stream().map(h -> labels.getOrDefault(h, h)).toList(),
                blockCodes(List.of(p.id())).getOrDefault(p.id(), List.of()), l.open(), l.resolved(),
                now.inShift(), now.today(), week);
    }

    // ---------------------------------------------------------------- shifts

    /**
     * Replaces a Staff member's default weekly shifts, used by every week a Manager did not plan: each a weekday
     * (1 = Monday … 7 = Sunday) and {@code HH:mm} start and end (an end before the start runs past midnight). An empty
     * list leaves the person with no default shift.
     */
    @Transactional
    public List<StaffShifts.Shift> setShifts(String id, List<StaffShifts.Shift> wanted) {
        currentUser.require(Permission.MANAGE_BLOCK);
        Person p = person(id, true);
        if (p.role() != Role.STAFF) {
            throw FieldErrors.single("shifts", "Only Staff members have shifts.");
        }
        List<StaffShifts.Shift> clean = StaffShifts.clean(wanted);
        List<StaffShifts.Shift> before = shifts.of(p.id());
        shifts.replace(p.id(), clean);
        List<StaffShifts.Shift> after = shifts.of(p.id());
        if (!after.equals(before)) {
            audit.record("STAFF_SHIFTS_UPDATED", AuditLog.Tone.INFO, "User", p.id(), p.name(),
                    Map.of("shifts", Arrays.asList(StaffShifts.text(before), StaffShifts.text(after))));
        }
        return after;
    }

    // ---------------------------------------------------------------- one person's work

    /** The person's open items: overdue first, then by due time, then the oldest first. */
    @Transactional(readOnly = true)
    public WorkPage work(String id) {
        currentUser.require(Permission.MANAGE_BLOCK);
        Person p = person(id, false);
        List<WorkItem> items = work.stream().flatMap(w -> w.openItems(p.id()).stream())
                .sorted(Comparator.comparing((StaffWork.Item i) -> !i.overdue())
                        .thenComparing(StaffWork.Item::dueAt, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(StaffWork.Item::openedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(StaffWork.Item::code))
                .map(i -> new WorkItem(TYPE_LABELS.get(i.type()), i.id(), i.code(), i.title(), i.roomCode(),
                        i.status(), i.openedAt(), i.dueAt(), i.overdue(), i.link()))
                .toList();
        return new WorkPage(items, items.size());
    }

    /**
     * Moves open items from the person {@code id} to {@code toStaffId}, all or none: each item must still be open and
     * held by that person, and the receiver must work in its Block and handle its kind. Each move is audited and the
     * receiver is told in the app.
     */
    @Transactional
    public Moved reassign(String id, List<WorkRef> refs, Object toStaffId, String note) {
        AuthenticatedUser manager = currentUser.require(Permission.MANAGE_BLOCK);
        Person from = person(id, true);
        FieldErrors errors = new FieldErrors();
        String why = note == null ? "" : note.trim();
        errors.check(!why.isEmpty(), "note", "Say why you move this work.");
        errors.check(why.length() <= MAX_NOTE, "note", "Keep the note under 300 characters.");
        errors.check(refs != null && !refs.isEmpty() && refs.size() <= MAX_ITEMS, "items",
                "Choose the work to move (at most 100 items).");
        String to = toStaffId == null ? "" : String.valueOf(toStaffId).trim();
        errors.check(!to.isEmpty(), "toStaffId", "Choose who receives the work.");
        errors.check(!to.equals(String.valueOf(from.id())), "toStaffId", "Choose someone other than the current holder.");
        errors.throwIfAny();
        Person receiver = person(to, true);

        // Every check first: one refused item moves nothing.
        List<StaffWork.Item> items = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Map<String, StaffWork> owners = new HashMap<>();
        for (WorkRef ref : refs) {
            String type = typeCode(ref == null ? null : ref.type());
            long itemId = number(ref == null ? null : ref.id());
            if (type == null || itemId < 0) {
                throw FieldErrors.single("items", "Choose the work to move from the list.");
            }
            if (!seen.add(type + itemId)) {
                continue;
            }
            StaffWork owner = work.stream().filter(w -> w.handles(type)).findFirst()
                    .orElseThrow(() -> FieldErrors.single("items", "Choose the work to move from the list."));
            StaffWork.Item item = owner.lockOpen(type, itemId);
            if (item == null || item.assigneeId() != from.id()) {
                throw ApiException.conflict("ITEM_CLOSED",
                        "Some of this work was closed or moved meanwhile. Reload the list and try again.");
            }
            blockScope.check(item.buildingId());
            if (!blockIds(receiver.id()).contains(item.buildingId())) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "NOT_IN_BLOCK",
                        receiver.name() + " does not work in Block " + blocks.codesByIds(List.of(item.buildingId()))
                                .getOrDefault(item.buildingId(), "") + ".");
            }
            if (!receiver.handles().contains(TYPE_HANDLES.get(type))) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "HANDLE_MISMATCH",
                        receiver.name() + " does not handle this type of work.");
            }
            items.add(item);
            owners.put(type + itemId, owner);
        }

        for (StaffWork.Item item : items) {
            owners.get(item.type() + item.id()).reassign(item.type(), Long.parseLong(item.id()), receiver.id(), why);
            Map<String, Object> change = new LinkedHashMap<>();
            change.put("from", from.name());
            change.put("to", receiver.name());
            change.put("type", TYPE_LABELS.get(item.type()));
            change.put("code", item.code());
            change.put("note", why);
            audit.record("WORK_REASSIGNED", AuditLog.Tone.INFO, TYPE_LABELS.get(item.type()), item.id(), item.code(),
                    change);
            events.publishEvent(new WorkReassigned(receiver.id(), item.code(), item.title(), from.name(),
                    manager.name(), why, receiver.role() == Role.MANAGER ? item.link()
                            : item.link().replaceFirst("^/manager/", "/staff/")));
        }
        return new Moved(items.size());
    }

    private static String typeCode(String value) {
        if (value == null) {
            return null;
        }
        String v = value.trim();
        return TYPE_LABELS.entrySet().stream()
                .filter(e -> e.getKey().equalsIgnoreCase(v) || e.getValue().equalsIgnoreCase(v))
                .map(Map.Entry::getKey).findFirst().orElse(null);
    }

    private static long number(String value) {
        String v = value == null ? "" : value.trim();
        return v.isEmpty() || v.length() > 18 || !v.chars().allMatch(Character::isDigit) ? -1 : Long.parseLong(v);
    }

    private Set<Long> blockIds(long userId) {
        return Set.copyOf(jdbc.sql("SELECT building_id FROM auth_user_block WHERE user_id = :u").param("u", userId)
                .query(Long.class).list());
    }

    // ---------------------------------------------------------------- account requests

    /**
     * Asks Admin to create a Staff or Manager account for the Block. {@code block} may be left out when the
     * Manager has one Block.
     */
    @Transactional
    public Created requestAccount(String name, String email, String role, String block) {
        AuthenticatedUser me = currentUser.require(Permission.MANAGE_BLOCK);
        BlockSelection selection = blockScope.resolve(block);
        FieldErrors errors = new FieldErrors();
        errors.check(selection.single(), "block", "Choose the Block for the new account.");
        String fullName = name == null ? "" : name.trim();
        errors.check(!fullName.isEmpty() && fullName.length() <= 150, "name", "Enter the full name (at most 150 characters).");
        String address = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        String domain = properties.google() == null ? null : properties.google().hostedDomain();
        errors.check(address.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+") && address.length() <= 254, "email",
                "Enter a valid email.");
        if (!errors.has("email") && domain != null && !domain.isBlank()) {
            errors.check(address.endsWith("@" + domain.toLowerCase(Locale.ROOT)), "email", "Use an @" + domain + " email.");
        }
        Role wanted = ROLES.stream().filter(r -> role != null && (r.name().equalsIgnoreCase(role.trim())
                || AdminUserService.roleLabel(r).equalsIgnoreCase(role.trim()))).findFirst().orElse(null);
        errors.check(wanted != null, "role", "Choose Staff or Manager.");
        if (!errors.has("email")) {
            boolean exists = jdbc.sql("SELECT count(*) FROM auth_user WHERE lower(email) = :email")
                    .param("email", address).query(Long.class).single() > 0;
            errors.check(!exists, "email", "An account with this email already exists.");
            boolean waiting = !exists && jdbc.sql("""
                    SELECT count(*) FROM auth_staff_account_request WHERE lower(email) = :email AND status = 'PENDING'
                    """).param("email", address).query(Long.class).single() > 0;
            errors.check(!waiting, "email", "A request for this email is already waiting for Admin.");
        }
        errors.throwIfAny();
        long building = selection.singleId();
        long id = jdbc.sql("""
                INSERT INTO auth_staff_account_request (building_id, requested_by, name, email, role, created_at)
                VALUES (:b, :by, :name, :email, :role, :now) RETURNING id
                """)
                .param("b", building).param("by", me.userId()).param("name", fullName).param("email", address)
                .param("role", wanted.name()).param("now", Timestamp.from(Instant.now(clock)))
                .query(Long.class).single();
        audit.record("STAFF_ACCOUNT_REQUESTED", AuditLog.Tone.INFO, "Staff account request", id, address,
                Map.of("role", AdminUserService.roleLabel(wanted), "block",
                        blocks.codesByIds(List.of(building)).getOrDefault(building, "")));
        return new Created(String.valueOf(id));
    }

    // ---------------------------------------------------------------- helpers

    private Person self(long userId, boolean lock) {
        return jdbc.sql("""
                SELECT u.id, u.display_name, u.role, u.title, coalesce(p.handles, '{}') AS handles,
                       coalesce(p.on_duty, FALSE) AS on_duty
                FROM auth_user u LEFT JOIN auth_staff_profile p ON p.user_id = u.id
                WHERE u.id = :id
                """ + (lock ? " FOR UPDATE OF u" : "")).param("id", userId)
                .query((rs, i) -> new Person(rs.getLong("id"), rs.getString("display_name"),
                        Role.valueOf(rs.getString("role")), rs.getString("title"),
                        List.of((String[]) rs.getArray("handles").getArray()), rs.getBoolean("on_duty")))
                .single();
    }

    /** A Staff member or Manager who shares a Block with the current Manager; anyone else answers 404. */
    private Person person(String id, boolean lock) {
        Set<Long> mine = currentUser.get().blockIds();
        if (id == null || id.isBlank() || id.length() > 18 || !id.chars().allMatch(Character::isDigit) || mine.isEmpty()) {
            throw ApiException.notFound("This staff member does not exist.");
        }
        return jdbc.sql("""
                SELECT u.id, u.display_name, u.role, u.title, coalesce(p.handles, '{}') AS handles,
                       coalesce(p.on_duty, FALSE) AS on_duty
                FROM auth_user u LEFT JOIN auth_staff_profile p ON p.user_id = u.id
                WHERE u.id = :id AND u.role IN ('STAFF', 'MANAGER') AND u.status = 'ACTIVE'
                  AND EXISTS (SELECT 1 FROM auth_user_block b WHERE b.user_id = u.id AND b.building_id IN (:mine))
                """ + (lock ? " FOR UPDATE OF u" : "")).param("id", Long.parseLong(id)).param("mine", List.copyOf(mine))
                .query((rs, i) -> new Person(rs.getLong("id"), rs.getString("display_name"),
                        Role.valueOf(rs.getString("role")), rs.getString("title"),
                        List.of((String[]) rs.getArray("handles").getArray()), rs.getBoolean("on_duty")))
                .optional().orElseThrow(() -> ApiException.notFound("This staff member does not exist."));
    }

    private static String labelList(List<String> codes, Map<String, String> labels) {
        return String.join(", ", codes.stream().map(h -> labels.getOrDefault(h, h)).toList());
    }

    private Map<Long, List<String>> blockCodes(List<Long> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        List<long[]> pairs = jdbc.sql("SELECT user_id, building_id FROM auth_user_block WHERE user_id IN (:ids)")
                .param("ids", userIds).query((rs, i) -> new long[] { rs.getLong("user_id"), rs.getLong("building_id") })
                .list();
        Map<Long, String> codes = blocks.codesByIds(pairs.stream().map(p -> p[1]).toList());
        Map<Long, List<String>> result = new HashMap<>();
        // codesByIds is in Block code order, so each person's list comes out sorted.
        codes.forEach((building, code) -> pairs.stream().filter(p -> p[1] == building)
                .forEach(p -> result.computeIfAbsent(p[0], k -> new ArrayList<>()).add(code)));
        return result;
    }
}
