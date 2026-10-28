package vn.fpt.campusstay.service.auth;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.StaffHandles;
import vn.fpt.campusstay.service.auth.StaffWorkload;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.config.AuthProperties;

/**
 * Block Manager › Staff: who works in the Block, what each person handles (routing
 * uses it) and who is on duty today. Name, email and role stay with Admin; the
 * Manager asks Admin for new accounts.
 */
@Service
public class BlockStaffService {

    /** @param handles labels of the {@code STAFF_HANDLE} list; {@code blocks} Block codes */
    public record Item(String id, String name, String title, List<String> handles, List<String> blocks, long open,
            long resolved7d, boolean onDuty) {
    }

    public record Summary(int total, int shared, Double averageOpen, int onDuty, int deskOnDuty) {
    }

    public record Page(List<Item> items, Summary summary, List<String> handleOptions, List<String> roleOptions) {
    }

    public record Created(String id) {
    }

    /** @param open requests assigned now; {@code resolved7d} resolved in the last 7 days */
    public record Me(String id, boolean onDuty, List<String> handles, List<String> blocks, long open, long resolved7d) {
    }

    private record Person(long id, String name, Role role, String title, List<String> handles, boolean onDuty) {
    }

    private static final Duration RESOLVED_WINDOW = Duration.ofDays(7);
    private static final List<Role> ROLES = List.of(Role.STAFF, Role.MANAGER);

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blocks;
    private final StaffHandles handles;
    private final List<StaffWorkload> workloads;
    private final AuthProperties properties;
    private final AuditLog audit;
    private final Clock clock;

    public BlockStaffService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, BlockDirectory blocks,
            StaffHandles handles, List<StaffWorkload> workloads, AuthProperties properties, AuditLog audit,
            Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blocks = blocks;
        this.handles = handles;
        this.workloads = workloads;
        this.properties = properties;
        this.audit = audit;
        this.clock = clock;
    }

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
        Map<Long, long[]> load = new HashMap<>();
        Instant since = Instant.now(clock).minus(RESOLVED_WINDOW);
        for (StaffWorkload w : workloads) {
            w.workload(ids, since).forEach((id, l) -> {
                long[] sum = load.computeIfAbsent(id, k -> new long[2]);
                sum[0] += l.open();
                sum[1] += l.resolved();
            });
        }
        Map<String, String> labels = handles.labels();
        List<Item> items = people.stream().map(p -> {
            long[] l = load.getOrDefault(p.id(), new long[2]);
            return new Item(String.valueOf(p.id()), p.name(),
                    p.title() != null ? p.title() : AdminUserService.roleLabel(p.role()),
                    p.handles().stream().map(h -> labels.getOrDefault(h, h)).toList(),
                    blockCodes.getOrDefault(p.id(), List.of()), l[0], l[1], p.onDuty());
        }).toList();
        Double averageOpen = items.isEmpty() ? null
                : Math.round(items.stream().mapToLong(Item::open).average().orElse(0) * 10) / 10.0;
        Summary summary = new Summary(items.size(), (int) items.stream().filter(i -> i.blocks().size() > 1).count(),
                averageOpen, (int) items.stream().filter(Item::onDuty).count(),
                (int) people.stream().filter(p -> p.onDuty() && p.handles().contains("DESK")).count());
        return new Page(items, summary, List.copyOf(labels.values()),
                ROLES.stream().map(AdminUserService::roleLabel).toList());
    }

    /** Changes only what is sent: {@code handles} (labels or codes) and {@code onDuty}. */
    @Transactional
    public void update(String id, List<String> newHandles, Boolean onDuty) {
        currentUser.require(Permission.MANAGE_BLOCK);
        Person p = person(id);
        Map<String, String> labels = handles.labels();
        List<String> codes = p.handles();
        if (newHandles != null) {
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
            codes = labels.keySet().stream().filter(chosen::contains).toList();
        }
        boolean duty = onDuty != null ? onDuty : p.onDuty();
        jdbc.sql("""
                INSERT INTO auth_staff_profile (user_id, handles, on_duty) VALUES (:id, :handles, :duty)
                ON CONFLICT (user_id) DO UPDATE SET handles = EXCLUDED.handles, on_duty = EXCLUDED.on_duty
                """).param("id", p.id()).param("handles", codes.toArray(String[]::new)).param("duty", duty).update();
        Map<String, Object> change = new LinkedHashMap<>();
        if (!codes.equals(p.handles())) {
            change.put("handles", Arrays.asList(labelList(p.handles(), labels), labelList(codes, labels)));
        }
        if (duty != p.onDuty()) {
            change.put("onDuty", Arrays.asList(p.onDuty(), duty));
        }
        if (!change.isEmpty()) {
            audit.record("STAFF_PROFILE_UPDATED", AuditLog.Tone.INFO, "User", p.id(), p.name(), change);
        }
    }

    /** The signed-in Staff member's or Manager's own duty, request types and workload (A-60). */
    @Transactional(readOnly = true)
    public Me me() {
        AuthenticatedUser user = currentUser.require(Role.STAFF, Role.MANAGER);
        return me(self(user.userId(), false));
    }

    /**
     * Starts or ends the signed-in person's shift (A-60). Routing gives new requests to people on duty first, so the
     * person who is at work says so; a Manager can still change it on Block staff.
     */
    @Transactional
    public Me setDuty(Boolean onDuty) {
        if (onDuty == null) {
            throw FieldErrors.single("onDuty", "Say whether you are on duty.");
        }
        AuthenticatedUser user = currentUser.require(Role.STAFF, Role.MANAGER);
        Person p = self(user.userId(), true);
        jdbc.sql("""
                INSERT INTO auth_staff_profile (user_id, handles, on_duty) VALUES (:id, :handles, :duty)
                ON CONFLICT (user_id) DO UPDATE SET on_duty = EXCLUDED.on_duty
                """).param("id", p.id()).param("handles", p.handles().toArray(String[]::new)).param("duty", onDuty).update();
        if (onDuty != p.onDuty()) {
            audit.record("STAFF_DUTY_CHANGED", AuditLog.Tone.INFO, "User", p.id(), p.name(),
                    Map.of("onDuty", Arrays.asList(p.onDuty(), onDuty)));
        }
        return me(new Person(p.id(), p.name(), p.role(), p.title(), p.handles(), onDuty));
    }

    private Me me(Person p) {
        long[] sum = new long[2];
        Instant since = Instant.now(clock).minus(RESOLVED_WINDOW);
        for (StaffWorkload w : workloads) {
            StaffWorkload.Load l = w.workload(List.of(p.id()), since).get(p.id());
            if (l != null) {
                sum[0] += l.open();
                sum[1] += l.resolved();
            }
        }
        Map<String, String> labels = handles.labels();
        return new Me(String.valueOf(p.id()), p.onDuty(), p.handles().stream().map(h -> labels.getOrDefault(h, h)).toList(),
                blockCodes(List.of(p.id())).getOrDefault(p.id(), List.of()), sum[0], sum[1]);
    }

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

    /** A Staff member or Manager who shares a Block with the current Manager; anyone else answers 404. */
    private Person person(String id) {
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
                FOR UPDATE OF u
                """).param("id", Long.parseLong(id)).param("mine", List.copyOf(mine))
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
