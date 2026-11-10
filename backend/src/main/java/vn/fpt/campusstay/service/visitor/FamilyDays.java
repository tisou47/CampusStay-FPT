package vn.fpt.campusstay.service.visitor;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.exception.ApiException;

/**
 * Reads of the Family Day tables ({@code vis_*}) shared by the Manager's, the student's and the desk's services,
 * and the labels the API shows. Writes stay in the services, inside their transactions.
 */
@Component
class FamilyDays {

    static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm").withZone(TimeConfig.CAMPUS_ZONE);
    static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy").withZone(TimeConfig.CAMPUS_ZONE);

    static final Map<String, String> VISITOR_STATUSES = Map.of("NOT_ARRIVED", "Not arrived", "CHECKED_IN", "Checked in",
            "CHECKED_OUT", "Checked out", "NO_SHOW", "No-show", "CANCELLED", "Cancelled");
    static final Map<String, String> REGISTRATION_STATUSES = Map.of("APPROVED", "Approved", "CANCELLED", "Cancelled");

    record Day(long id, long buildingId, String title, String description, String area, Instant opensAt,
            Instant closesAt, int maxGuests, String status, long createdBy, Instant createdAt, Instant publishedAt,
            Instant cancelledAt, String cancelReason, Instant closedAt, Long closedBy, String closeNote) {
    }

    record Slot(long id, long dayId, Instant startsAt, Instant endsAt, int capacity, int booked) {

        String label() {
            return DAY.format(startsAt) + " " + TIME.format(startsAt) + "–" + TIME.format(endsAt);
        }
    }

    record Registration(long id, long dayId, long slotId, long studentId, String status, Instant createdAt,
            Instant cancelledAt, Long cancelledBy, String cancelReason) {
    }

    record Visitor(long id, long registrationId, String fullName, String relationship, int birthYear,
            String passToken, String status, Instant checkedInAt, Long checkedInBy, Instant checkedOutAt,
            Long checkedOutBy, String checkOutNote) {
    }

    private static final String DAY_COLUMNS = """
            SELECT id, building_id, title, description, area, registration_opens_at, registration_closes_at, max_guests,
                   status, created_by, created_at, published_at, cancelled_at, cancel_reason, closed_at, closed_by,
                   close_note
            FROM vis_family_day
            """;
    private static final String SLOT_COLUMNS = "SELECT id, family_day_id, starts_at, ends_at, capacity, booked FROM vis_time_slot ";
    private static final String REGISTRATION_COLUMNS = """
            SELECT id, family_day_id, time_slot_id, student_id, status, created_at, cancelled_at, cancelled_by,
                   cancel_reason
            FROM vis_registration
            """;
    private static final String VISITOR_COLUMNS = """
            SELECT id, registration_id, full_name, relationship, birth_year, pass_token, status, checked_in_at,
                   checked_in_by, checked_out_at, checked_out_by, check_out_note
            FROM vis_visitor
            """;

    private final JdbcClient jdbc;

    FamilyDays(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------------------------------------------------------- Family Days

    Optional<Day> find(long id) {
        return jdbc.sql(DAY_COLUMNS + " WHERE id = :id").param("id", id).query(FamilyDays::day).optional();
    }

    /** The Family Day, locked until the transaction ends (status changes, desk actions). */
    Day lock(long id) {
        return jdbc.sql(DAY_COLUMNS + " WHERE id = :id FOR UPDATE").param("id", id).query(FamilyDays::day).optional()
                .orElseThrow(FamilyDays::missing);
    }

    Day get(long id) {
        return find(id).orElseThrow(FamilyDays::missing);
    }

    List<Day> ofBuildings(Collection<Long> buildingIds) {
        if (buildingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(DAY_COLUMNS + " WHERE building_id IN (:b) ORDER BY id DESC").param("b", buildingIds)
                .query(FamilyDays::day).list();
    }

    static ApiException missing() {
        return ApiException.notFound("This Family Day does not exist.");
    }

    /** A path id that is not a number cannot exist: 404 like an unknown one. */
    static long id(String value, String what) {
        try {
            return Long.parseLong(value == null ? "" : value.trim());
        } catch (NumberFormatException e) {
            throw ApiException.notFound("This " + what + " does not exist.");
        }
    }

    // ---------------------------------------------------------------- slots

    List<Slot> slots(long dayId) {
        return jdbc.sql(SLOT_COLUMNS + "WHERE family_day_id = :d ORDER BY starts_at, id").param("d", dayId)
                .query(FamilyDays::slot).list();
    }

    List<Slot> slots(Collection<Long> dayIds) {
        if (dayIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(SLOT_COLUMNS + "WHERE family_day_id IN (:d) ORDER BY starts_at, id").param("d", dayIds)
                .query(FamilyDays::slot).list();
    }

    Optional<Slot> slot(long id) {
        return jdbc.sql(SLOT_COLUMNS + "WHERE id = :id").param("id", id).query(FamilyDays::slot).optional();
    }

    // ---------------------------------------------------------------- registrations and visitors

    List<Registration> registrations(long dayId) {
        return jdbc.sql(REGISTRATION_COLUMNS + " WHERE family_day_id = :d ORDER BY id").param("d", dayId)
                .query(FamilyDays::registration).list();
    }

    Optional<Registration> registration(long id) {
        return jdbc.sql(REGISTRATION_COLUMNS + " WHERE id = :id").param("id", id).query(FamilyDays::registration)
                .optional();
    }

    /** The student's registration for the Family Day: the live one, else the last cancelled one. */
    Optional<Registration> registrationOf(long dayId, long studentId) {
        return jdbc.sql(REGISTRATION_COLUMNS + """
                 WHERE family_day_id = :d AND student_id = :s
                ORDER BY (status = 'APPROVED') DESC, id DESC LIMIT 1
                """).param("d", dayId).param("s", studentId).query(FamilyDays::registration).optional();
    }

    List<Registration> registrationsOf(long studentId, Collection<Long> dayIds) {
        if (dayIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(REGISTRATION_COLUMNS + " WHERE student_id = :s AND family_day_id IN (:d) ORDER BY id")
                .param("s", studentId).param("d", dayIds).query(FamilyDays::registration).list();
    }

    List<Visitor> visitors(Collection<Long> registrationIds) {
        if (registrationIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(VISITOR_COLUMNS + " WHERE registration_id IN (:r) ORDER BY id").param("r", registrationIds)
                .query(FamilyDays::visitor).list();
    }

    Optional<Visitor> visitor(long id) {
        return jdbc.sql(VISITOR_COLUMNS + " WHERE id = :id").param("id", id).query(FamilyDays::visitor).optional();
    }

    Optional<Visitor> visitorByPass(String token) {
        return jdbc.sql(VISITOR_COLUMNS + " WHERE pass_token = :t").param("t", token).query(FamilyDays::visitor)
                .optional();
    }

    /** Guests inside now (checked in, not out) and guests who were let in at all, per Family Day. */
    long count(long dayId, String visitorStatus) {
        return jdbc.sql("""
                SELECT count(*) FROM vis_visitor v JOIN vis_registration r ON r.id = v.registration_id
                WHERE r.family_day_id = :d AND v.status = :s
                """).param("d", dayId).param("s", visitorStatus).query(Long.class).single();
    }

    // ---------------------------------------------------------------- labels

    /**
     * What the Family Day is now: Draft, Published (registration not open yet), Registration open, Registration closed,
     * In progress (from the first time slot until a Manager closes it), Completed or Cancelled.
     */
    static String status(Day day, List<Slot> slots, Instant now) {
        return switch (day.status()) {
            case "DRAFT" -> "Draft";
            case "CANCELLED" -> "Cancelled";
            case "COMPLETED" -> "Completed";
            default -> {
                if (now.isBefore(day.opensAt())) {
                    yield "Published";
                }
                if (now.isBefore(day.closesAt())) {
                    yield "Registration open";
                }
                Instant first = firstStart(slots);
                yield first != null && now.isBefore(first) ? "Registration closed" : "In progress";
            }
        };
    }

    static Instant firstStart(List<Slot> slots) {
        return slots.stream().map(Slot::startsAt).min(Instant::compareTo).orElse(null);
    }

    static Instant lastEnd(List<Slot> slots) {
        return slots.stream().map(Slot::endsAt).max(Instant::compareTo).orElse(null);
    }

    /** A guest not arrived when their time slot is over is shown as a No-show (stored as one when the day closes). */
    static String visitorStatus(Visitor v, Slot slot, Instant now) {
        if (v.status().equals("NOT_ARRIVED") && slot != null && !now.isBefore(slot.endsAt())) {
            return "No-show";
        }
        return VISITOR_STATUSES.get(v.status());
    }

    /** Inside after the end of their time slot. */
    static boolean overdue(Visitor v, Slot slot, Instant now) {
        return v.status().equals("CHECKED_IN") && slot != null && !now.isBefore(slot.endsAt());
    }

    // ---------------------------------------------------------------- mapping

    static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }

    static Long longOrNull(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    private static Day day(ResultSet rs, int i) throws SQLException {
        return new Day(rs.getLong("id"), rs.getLong("building_id"), rs.getString("title"), rs.getString("description"),
                rs.getString("area"), instant(rs, "registration_opens_at"), instant(rs, "registration_closes_at"),
                rs.getInt("max_guests"), rs.getString("status"), rs.getLong("created_by"), instant(rs, "created_at"),
                instant(rs, "published_at"), instant(rs, "cancelled_at"), rs.getString("cancel_reason"),
                instant(rs, "closed_at"), longOrNull(rs, "closed_by"), rs.getString("close_note"));
    }

    private static Slot slot(ResultSet rs, int i) throws SQLException {
        return new Slot(rs.getLong("id"), rs.getLong("family_day_id"), instant(rs, "starts_at"), instant(rs, "ends_at"),
                rs.getInt("capacity"), rs.getInt("booked"));
    }

    private static Registration registration(ResultSet rs, int i) throws SQLException {
        return new Registration(rs.getLong("id"), rs.getLong("family_day_id"), rs.getLong("time_slot_id"),
                rs.getLong("student_id"), rs.getString("status"), instant(rs, "created_at"),
                instant(rs, "cancelled_at"), longOrNull(rs, "cancelled_by"), rs.getString("cancel_reason"));
    }

    private static Visitor visitor(ResultSet rs, int i) throws SQLException {
        return new Visitor(rs.getLong("id"), rs.getLong("registration_id"), rs.getString("full_name"),
                rs.getString("relationship"), rs.getInt("birth_year"), rs.getString("pass_token"),
                rs.getString("status"), instant(rs, "checked_in_at"), longOrNull(rs, "checked_in_by"),
                instant(rs, "checked_out_at"), longOrNull(rs, "checked_out_by"), rs.getString("check_out_note"));
    }
}
