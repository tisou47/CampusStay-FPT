package vn.fpt.campusstay.service.auth;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;

/**
 * What Staff members change, checked against the shift and the work a Manager gave them. A change outside the shift or
 * outside what the person handles needs the person's confirmation first ({@code security.ShiftGate}); every change is
 * recorded, and Managers read the record per person with those cases marked.
 */
@Service
public class StaffActivityService {

    /** The kind of work (STAFF_HANDLE code) of an endpoint, by the start of its path; other paths are any kind. */
    private static final Map<String, String> HANDLE_BY_PATH = new LinkedHashMap<>();

    static {
        // In the order of the Staff menu.
        // "/check-out" also covers the check-out furniture ("/check-outs/…"); "/handovers" are the check-in inventories.
        for (String p : List.of("/check-in", "/check-out", "/late-check-ins", "/handovers")) {
            HANDLE_BY_PATH.put(p, "DESK");
        }
        HANDLE_BY_PATH.put("/family-day-visitors", "FAMILY_DAY");
        for (String p : List.of("/room-changes", "/swaps", "/swap-board", "/moves", "/operational-moves")) {
            HANDLE_BY_PATH.put(p, "ROOM_CHANGES");
        }
        for (String p : List.of("/stay-requests", "/next-term-requests")) {
            HANDLE_BY_PATH.put(p, "NEXT_TERM");
        }
        for (String p : List.of("/door-codes", "/rooms/", "/furniture")) {
            HANDLE_BY_PATH.put(p, "ROOMS");
        }
        HANDLE_BY_PATH.put("/maintenance-requests", "MAINTENANCE");
        HANDLE_BY_PATH.put("/inspection-runs", "INSPECTIONS");
        for (String p : List.of("/meter-periods", "/meter-readings", "/turnover/meter-cuts")) {
            HANDLE_BY_PATH.put(p, "METER_READINGS");
        }
    }

    /** Paths never checked nor recorded: the person's own account, notifications, devices, and Manager or Admin screens. */
    private static final List<String> OPEN = List.of("/auth/", "/notifications", "/devices", "/block-staff", "/search",
            "/files", "/error", "/staff-account-requests", "/staff-accounts", "/admin", "/week-schedule");

    /** The result of the check before a change. */
    public record Check(boolean inShift, boolean roleMatch, String handle, String handleLabel, String shiftToday) {
        public boolean needsConfirmation() {
            return !inShift || !roleMatch;
        }
    }

    public record Item(String id, String staffId, String staffName, Instant at, String action, String method,
            String objectId, String handle, boolean inShift, boolean roleMatch, boolean acknowledged, boolean flagged,
            int status) {
    }

    public record Summary(long total, long outOfShift, long roleMismatch) {
    }

    public record Page(List<Item> items, long total, Summary summary, List<Option> staffOptions) {
    }

    public record Option(String id, String name) {
    }

    private final JdbcClient jdbc;
    private final StaffShifts shifts;
    private final StaffHandles handles;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;

    StaffActivityService(JdbcClient jdbc, StaffShifts shifts, StaffHandles handles, CurrentUser currentUser,
            BlockScope blockScope) {
        this.jdbc = jdbc;
        this.shifts = shifts;
        this.handles = handles;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
    }

    /** Whether a call to {@code path} with {@code method} is a change to check and record. */
    public static boolean watched(String method, String path) {
        return !("GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method))
                && OPEN.stream().noneMatch(path::startsWith);
    }

    /** The kind of work of the endpoint, or null when it is not one kind. */
    public static String handleOf(String path) {
        return HANDLE_BY_PATH.entrySet().stream().filter(e -> path.startsWith(e.getKey())).map(Map.Entry::getValue)
                .findFirst().orElse(null);
    }

    /** Checks the Staff member's shift now and whether they handle the endpoint's kind of work. */
    @Transactional(readOnly = true)
    public Check check(long userId, String path) {
        StaffShifts.Now now = shifts.nowOf(userId);
        String handle = handleOf(path);
        boolean roleMatch = handle == null || jdbc.sql("""
                SELECT count(*) FROM auth_staff_profile WHERE user_id = :id AND :h = ANY (handles)
                """).param("id", userId).param("h", handle).query(Long.class).single() > 0;
        return new Check(now.inShift(), roleMatch, handle,
                handle == null ? null : handles.labels().getOrDefault(handle, handle), now.today());
    }

    /** Records a change, in its own transaction so a change that failed is recorded too. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(long userId, String method, String pattern, String objectId, Check check, boolean acknowledged,
            int status) {
        jdbc.sql("""
                INSERT INTO auth_staff_activity (user_id, at, method, pattern, object_id, handle, in_shift, role_match,
                                                 acknowledged, status)
                VALUES (:u, :at, :m, :p, :o, :h, :s, :r, :a, :st)
                """).param("u", userId).param("at", Timestamp.from(shifts.now().toInstant())).param("m", method)
                .param("p", truncate(pattern, 200)).param("o", truncate(objectId, 100)).param("h", check.handle())
                .param("s", check.inShift()).param("r", check.roleMatch()).param("a", acknowledged)
                .param("st", status).update();
    }

    /**
     * The changes of the Staff of the Manager's Blocks, newest first; {@code staffId} narrows to one person,
     * {@code flagged} to the changes outside the shift or the person's work, {@code from}/{@code to} to days.
     */
    @Transactional(readOnly = true)
    public Page list(String block, String staffId, Boolean flagged, LocalDate from, LocalDate to, Integer page,
            Integer pageSize) {
        currentUser.require(Permission.MANAGE_BLOCK);
        BlockSelection selection = blockScope.resolve(block);
        PageQuery pq = PageQuery.of(page, pageSize);
        List<Long> blockIds = List.copyOf(selection.ids());
        List<Option> staff = jdbc.sql("""
                SELECT DISTINCT u.id, u.display_name FROM auth_user u JOIN auth_user_block b ON b.user_id = u.id
                WHERE u.role = 'STAFF' AND b.building_id IN (:b) ORDER BY u.display_name
                """).param("b", blockIds).query((rs, i) -> new Option(rs.getString("id"), rs.getString("display_name")))
                .list();
        Set<String> allowed = staff.stream().map(Option::id).collect(java.util.stream.Collectors.toSet());
        if (staffId != null && !staffId.isBlank() && !allowed.contains(staffId.trim())) {
            throw ApiException.notFound("This staff member does not exist.");
        }
        StringBuilder where = new StringBuilder(" WHERE a.user_id IN (:ids)");
        Map<String, Object> params = new LinkedHashMap<>();
        List<Long> ids = staffId != null && !staffId.isBlank() ? List.of(Long.parseLong(staffId.trim()))
                : allowed.stream().map(Long::parseLong).toList();
        params.put("ids", ids.isEmpty() ? List.of(-1L) : ids);
        if (from != null) {
            where.append(" AND a.at >= :from");
            params.put("from", Timestamp.from(from.atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant()));
        }
        if (to != null) {
            where.append(" AND a.at < :to");
            params.put("to", Timestamp.from(to.plusDays(1).atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant()));
        }
        String counted = where.toString();
        if (Boolean.TRUE.equals(flagged)) {
            where.append(" AND NOT (a.in_shift AND a.role_match)");
        }
        Map<String, String> labels = handles.labels();
        List<Item> items = jdbc.sql("""
                SELECT a.*, u.display_name FROM auth_staff_activity a JOIN auth_user u ON u.id = a.user_id
                """ + where + " ORDER BY a.at DESC, a.id DESC LIMIT :limit OFFSET :offset")
                .params(params).param("limit", pq.limit()).param("offset", pq.offset())
                .query((rs, i) -> {
                    boolean in = rs.getBoolean("in_shift");
                    boolean match = rs.getBoolean("role_match");
                    String h = rs.getString("handle");
                    return new Item(rs.getString("id"), rs.getString("user_id"), rs.getString("display_name"),
                            rs.getTimestamp("at").toInstant(), action(rs.getString("method"), rs.getString("pattern")),
                            rs.getString("method"), rs.getString("object_id"), h == null ? null : labels.getOrDefault(h, h),
                            in, match, rs.getBoolean("acknowledged"), !(in && match), rs.getInt("status"));
                }).list();
        long total = jdbc.sql("SELECT count(*) FROM auth_staff_activity a" + where).params(params)
                .query(Long.class).single();
        Summary summary = jdbc.sql("""
                SELECT count(*) AS total, count(*) FILTER (WHERE NOT a.in_shift) AS out_of_shift,
                       count(*) FILTER (WHERE NOT a.role_match) AS mismatch
                FROM auth_staff_activity a""" + counted).params(params)
                .query((rs, i) -> new Summary(rs.getLong("total"), rs.getLong("out_of_shift"), rs.getLong("mismatch")))
                .single();
        return new Page(items, total, summary, staff);
    }

    /** A readable name of the change from its endpoint: "Maintenance requests · updates". */
    static String action(String method, String pattern) {
        List<String> words = new ArrayList<>();
        for (String part : pattern.split("/")) {
            if (!part.isBlank() && !part.startsWith("{")) {
                words.add(part.replace('-', ' '));
            }
        }
        if (words.isEmpty()) {
            return method + " " + pattern;
        }
        String first = words.getFirst();
        String head = Character.toUpperCase(first.charAt(0)) + first.substring(1);
        String rest = String.join(" · ", words.subList(1, words.size()));
        String verb = switch (method) {
            case "POST" -> rest.isEmpty() ? "create" : "";
            case "PUT", "PATCH" -> rest.isEmpty() ? "update" : "";
            case "DELETE" -> "delete";
            default -> "";
        };
        String tail = String.join(" · ", List.of(rest, verb).stream().filter(s -> !s.isEmpty()).toList());
        return tail.isEmpty() ? head : head + " · " + tail;
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
