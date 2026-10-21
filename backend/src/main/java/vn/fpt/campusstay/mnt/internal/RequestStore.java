package vn.fpt.campusstay.mnt.internal;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.shared.time.TimeConfig;

/**
 * Reads of Maintenance Requests and their events, and the contract words for
 * their statuses. Clients address a request by its code ({@code MR-000321});
 * a plain number is accepted too.
 */
@Component
class RequestStore {

    record Request(long id, String code, Long termId, long roomId, Long bedId, long buildingId, String roomCode,
            long reporterId, String source, String title, String description, String category, String location,
            String urgency, String priority, boolean staffMayEnter, String status, Long assigneeId,
            Instant visitStart, Instant visitEnd, Instant reportedAt, Instant resolvedAt, Instant closedAt,
            int reopenCount) {

        boolean open() {
            return OPEN.contains(status);
        }
    }

    record Event(long id, Long actorId, String actorRole, String text, String message, boolean internal, Instant at) {
    }

    static final List<String> OPEN = List.of("SUBMITTED", "ASSIGNED", "IN_PROGRESS");

    private static final Map<String, String> STATUSES = Map.of("SUBMITTED", "Submitted", "ASSIGNED", "Assigned",
            "IN_PROGRESS", "In progress", "RESOLVED", "Resolved", "CLOSED", "Closed");
    private static final Map<String, String> PRIORITIES = Map.of("HIGH", "High", "MEDIUM", "Medium", "LOW", "Low");
    private static final Map<String, String> URGENCIES = Map.of("NORMAL", "Normal", "URGENT", "Urgent");
    static final List<String> PRIORITY_LABELS = List.of("High", "Medium", "Low");

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter DAY_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    private static final Pattern WINDOW = Pattern.compile(
            "(\\d{1,2}/\\d{1,2}/\\d{4})\\s+(\\d{1,2}:\\d{2})\\s*[-–—]\\s*(?:(\\d{1,2}/\\d{1,2}/\\d{4})\\s+)?(\\d{1,2}:\\d{2})");

    private final JdbcClient jdbc;

    RequestStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    static String statusLabel(String code) {
        return STATUSES.get(code);
    }

    static String priorityLabel(String code) {
        return PRIORITIES.get(code);
    }

    static String urgencyLabel(String code) {
        return URGENCIES.get(code);
    }

    /** Label or code, case-insensitive ({@code In progress}, {@code IN_PROGRESS}). */
    static Optional<String> statusCode(String value) {
        return code(STATUSES, value);
    }

    static Optional<String> priorityCode(String value) {
        return code(PRIORITIES, value);
    }

    static Optional<String> urgencyCode(String value) {
        return code(URGENCIES, value);
    }

    private static Optional<String> code(Map<String, String> labels, String value) {
        if (value == null) {
            return Optional.empty();
        }
        String v = value.trim();
        return labels.entrySet().stream()
                .filter(e -> e.getKey().equalsIgnoreCase(v.replace(' ', '_')) || e.getValue().equalsIgnoreCase(v))
                .map(Map.Entry::getKey).findFirst();
    }

    /** {@code 21/10/2026 14:00 – 16:00}; the end day is written only when it differs. */
    static String visitWindow(Instant start, Instant end) {
        if (start == null || end == null) {
            return null;
        }
        ZonedDateTime s = start.atZone(TimeConfig.CAMPUS_ZONE);
        ZonedDateTime e = end.atZone(TimeConfig.CAMPUS_ZONE);
        return DAY_TIME.format(s) + " – " + (s.toLocalDate().equals(e.toLocalDate()) ? TIME.format(e) : DAY_TIME.format(e));
    }

    /** Parses {@link #visitWindow}'s format; empty when the text does not match or the end is not after the start. */
    static Optional<Instant[]> parseVisitWindow(String text) {
        Matcher m = WINDOW.matcher(text == null ? "" : text.trim());
        if (!m.matches()) {
            return Optional.empty();
        }
        try {
            LocalDate day = LocalDate.parse(pad(m.group(1)), DAY);
            LocalDate endDay = m.group(3) == null ? day : LocalDate.parse(pad(m.group(3)), DAY);
            Instant start = day.atTime(LocalTime.parse(padTime(m.group(2)), TIME)).atZone(TimeConfig.CAMPUS_ZONE)
                    .toInstant();
            Instant end = endDay.atTime(LocalTime.parse(padTime(m.group(4)), TIME)).atZone(TimeConfig.CAMPUS_ZONE)
                    .toInstant();
            return end.isAfter(start) ? Optional.of(new Instant[] { start, end }) : Optional.empty();
        } catch (DateTimeParseException e) {
            return Optional.empty();
        }
    }

    private static String pad(String day) {
        String[] p = day.split("/");
        return String.format(Locale.ROOT, "%02d/%02d/%s", Integer.parseInt(p[0]), Integer.parseInt(p[1]), p[2]);
    }

    private static String padTime(String time) {
        return time.length() == 4 ? "0" + time : time;
    }

    Optional<Request> find(String idOrCode, boolean lock) {
        if (idOrCode == null || idOrCode.isBlank() || idOrCode.length() > 24) {
            return Optional.empty();
        }
        String value = idOrCode.trim();
        boolean numeric = value.chars().allMatch(Character::isDigit);
        return jdbc.sql("SELECT * FROM mnt_request WHERE " + (numeric ? "id = :id" : "upper(code) = upper(:code)")
                + (lock ? " FOR UPDATE" : ""))
                .param(numeric ? "id" : "code", numeric ? Long.parseLong(value) : value)
                .query(RequestStore::request).optional();
    }

    List<Event> events(long requestId) {
        return jdbc.sql("SELECT * FROM mnt_request_event WHERE request_id = :id ORDER BY at, id").param("id", requestId)
                .query((rs, i) -> new Event(rs.getLong("id"), rs.getObject("actor_id", Long.class),
                        rs.getString("actor_role"), rs.getString("text"), rs.getString("message"),
                        rs.getBoolean("internal"), instant(rs, "at")))
                .list();
    }

    void event(long requestId, Long actorId, String actorRole, String text, String message, boolean internal,
            Instant at) {
        jdbc.sql("""
                INSERT INTO mnt_request_event (request_id, actor_id, actor_role, text, message, internal, at)
                VALUES (:request, :actor, :role, :text, :message, :internal, :at)
                """)
                .param("request", requestId).param("actor", actorId).param("role", actorRole).param("text", text)
                .param("message", message).param("internal", internal).param("at", Timestamp.from(at)).update();
    }

    static Request request(ResultSet rs, int i) throws SQLException {
        return new Request(rs.getLong("id"), rs.getString("code"), rs.getObject("term_id", Long.class),
                rs.getLong("room_id"), rs.getObject("bed_id", Long.class), rs.getLong("building_id"),
                rs.getString("room_code"), rs.getLong("reporter_id"), rs.getString("source"), rs.getString("title"),
                rs.getString("description"), rs.getString("category"), rs.getString("location"),
                rs.getString("urgency"), rs.getString("priority"), rs.getBoolean("staff_may_enter"),
                rs.getString("status"), rs.getObject("assignee_id", Long.class), instant(rs, "visit_window_start"),
                instant(rs, "visit_window_end"), instant(rs, "reported_at"), instant(rs, "resolved_at"),
                instant(rs, "closed_at"), rs.getInt("reopen_count"));
    }

    static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
