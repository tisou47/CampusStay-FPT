package vn.fpt.campusstay.app.internal;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Reads and small writes of {@code app_application} and its timeline shared by
 * the APP services. Clients address an Application by its code
 * ({@code APP-SP27-000123}); a numeric id is accepted too.
 */
@Component
class ApplicationStore {

    /** Statuses that still hold the student's one Application per Term. */
    static final Set<String> LIVE = Set.of("DRAFT", "AWAITING_ROOMMATE", "AWAITING_DEPOSIT", "SUBMITTED",
            "UNDER_REVIEW", "APPROVED", "WAITLISTED", "ALLOCATED");

    private static final Map<String, String> LABELS = Map.ofEntries(Map.entry("DRAFT", "Draft"),
            Map.entry("AWAITING_ROOMMATE", "Awaiting Roommate"), Map.entry("AWAITING_DEPOSIT", "Awaiting Deposit"),
            Map.entry("SUBMITTED", "Submitted"), Map.entry("UNDER_REVIEW", "Under Review"),
            Map.entry("APPROVED", "Approved"), Map.entry("WAITLISTED", "Waitlisted"), Map.entry("ALLOCATED", "Allocated"),
            Map.entry("REJECTED", "Rejected"), Map.entry("CANCELLED", "Cancelled"), Map.entry("EXPIRED", "Expired"));

    record Application(long id, String code, long termId, long studentId, long roomTypeId, long roomClassId,
            long termPrice, BigDecimal surchargeRate, long depositAmount, String status, String roommateMode,
            Long partnerApplicationId, String preferences, String contact, Instant depositDueAt, Instant submittedAt,
            String decisionNote, Instant createdAt) {

        boolean live() {
            return LIVE.contains(status);
        }
    }

    private static final String COLUMNS = """
            id, code, term_id, student_id, room_type_id, room_class_id, term_price, surcharge_rate, deposit_amount,
            status, roommate_mode, partner_application_id, roommate_preferences::text AS preferences,
            contact::text AS contact, deposit_due_at, submitted_at, decision_note, created_at
            """;

    private final JdbcClient jdbc;
    private final Clock clock;

    ApplicationStore(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    static String label(String status) {
        return LABELS.get(status);
    }

    Optional<Application> find(String idOrCode) {
        if (idOrCode == null || idOrCode.isBlank()) {
            return Optional.empty();
        }
        String value = idOrCode.trim();
        if (value.chars().allMatch(Character::isDigit) && value.length() < 19) {
            return find(Long.parseLong(value), false);
        }
        return jdbc.sql("SELECT " + COLUMNS + " FROM app_application WHERE upper(code) = upper(:code)")
                .param("code", value).query(ApplicationStore::map).optional();
    }

    Optional<Application> find(long id, boolean lock) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM app_application WHERE id = :id" + (lock ? " FOR UPDATE" : ""))
                .param("id", id).query(ApplicationStore::map).optional();
    }

    /** The student's live Application in the Term, if any. */
    Optional<Application> live(long studentId, long termId) {
        return jdbc.sql("SELECT " + COLUMNS + """
                 FROM app_application WHERE student_id = :student AND term_id = :term
                  AND status NOT IN ('REJECTED', 'CANCELLED', 'EXPIRED')
                """)
                .param("student", studentId).param("term", termId).query(ApplicationStore::map).optional();
    }

    /** Newest first. */
    List<Application> ofStudent(long studentId) {
        return jdbc.sql("SELECT " + COLUMNS
                + " FROM app_application WHERE student_id = :student ORDER BY created_at DESC, id DESC")
                .param("student", studentId).query(ApplicationStore::map).list();
    }

    /** Moves the Application on only from the expected statuses; returns whether it moved. */
    boolean transition(long id, Set<String> from, String to) {
        return jdbc.sql("""
                UPDATE app_application SET status = :to, updated_at = :now, version = version + 1
                WHERE id = :id AND status IN (:from)
                """)
                .param("to", to).param("now", Timestamp.from(Instant.now(clock))).param("id", id)
                .param("from", List.copyOf(from)).update() > 0;
    }

    void event(long applicationId, String status, String text, String note, Long actorId) {
        jdbc.sql("""
                INSERT INTO app_application_event (application_id, status, text, note, actor_id, at)
                VALUES (:app, :status, :text, :note, :actor, :at)
                """)
                .param("app", applicationId).param("status", status).param("text", text).param("note", note)
                .param("actor", actorId).param("at", Timestamp.from(Instant.now(clock))).update();
    }

    static Application map(ResultSet rs, int i) throws SQLException {
        return new Application(rs.getLong("id"), rs.getString("code"), rs.getLong("term_id"), rs.getLong("student_id"),
                rs.getLong("room_type_id"), rs.getLong("room_class_id"), rs.getLong("term_price"),
                rs.getBigDecimal("surcharge_rate"), rs.getLong("deposit_amount"), rs.getString("status"),
                rs.getString("roommate_mode"), rs.getObject("partner_application_id", Long.class),
                rs.getString("preferences"), rs.getString("contact"), instant(rs, "deposit_due_at"),
                instant(rs, "submitted_at"), rs.getString("decision_note"), instant(rs, "created_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
