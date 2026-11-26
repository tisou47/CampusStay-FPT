package vn.fpt.campusstay.service.auth;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * Personal data under Decree 13/2023/ND-CP (W3-D3, contract "My data"): the privacy notice a student accepts, the
 * export of their own data, and erasure requests a Manager decides. Erasure anonymises the account only when no
 * feature still needs the data ({@link ErasureBlockers}); the records themselves (Invoices, Allocations) stay, tied
 * to the anonymised account, because the law on accounting keeps them.
 */
@Service
public class PrivacyService {

    public record Consent(String version, Instant acceptedAt) {
    }

    public record Erasure(String id, String status, String reason, Instant requestedAt, Instant decidedAt, String note) {
    }

    public record Status(String noticeVersion, Consent consent, boolean consentCurrent, Erasure erasure) {
    }

    public record Account(String name, String email, String locale, Instant createdAt) {
    }

    public record Profile(String studentCode, String gender, LocalDate dateOfBirth, String major, String cohort,
            String phone, String emergencyName, String emergencyRelationship, String emergencyPhone) {
    }

    public record Export(Instant exportedAt, Account account, Profile profile, RefundAccounts.Account refundAccount,
            List<Consent> consents, List<Erasure> erasureRequests, Map<String, List<StudentRecords.Item>> records) {
    }

    public record Created(String id, String status) {
    }

    public record Row(String id, String studentName, String studentCode, String reason, String status,
            Instant requestedAt, Instant decidedAt, String decidedBy, String note) {
    }

    public record Page(List<Row> items, long total) {
    }

    private static final int RECORDS_LIMIT = 1000;
    private static final Map<String, String> STATUS = Map.of("PENDING", "Pending", "REJECTED", "Rejected",
            "COMPLETED", "Completed");

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final Parameters parameters;
    private final RefundAccounts refundAccounts;
    private final List<StudentRecords> records;
    private final List<ErasureBlockers> blockers;
    private final AuditLog audit;
    private final Clock clock;

    public PrivacyService(JdbcClient jdbc, CurrentUser currentUser, Parameters parameters, RefundAccounts refundAccounts,
            List<StudentRecords> records, List<ErasureBlockers> blockers, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.parameters = parameters;
        this.refundAccounts = refundAccounts;
        this.records = records;
        this.blockers = blockers;
        this.audit = audit;
        this.clock = clock;
    }

    /** The version of the privacy notice students accept now. */
    public String noticeVersion() {
        return parameters.textValue("privacy.notice_version");
    }

    /**
     * Records that the student accepted the current notice; refuses another version (the screen showed an old
     * notice). Runs inside the caller's transaction (the verification form).
     */
    @Transactional
    public void accept(long studentId, String version) {
        if (version == null || !version.strip().equals(noticeVersion())) {
            throw FieldErrors.single("privacyNoticeVersion", "Read and accept the privacy notice to continue.");
        }
        jdbc.sql("""
                INSERT INTO auth_consent (user_id, version, accepted_at) VALUES (:u, :v, :now)
                ON CONFLICT (user_id, version) DO NOTHING
                """).param("u", studentId).param("v", noticeVersion()).param("now", Timestamp.from(Instant.now(clock)))
                .update();
    }

    @Transactional
    public void consent(String version) {
        accept(currentUser.require(Role.STUDENT).userId(), version);
    }

    @Transactional(readOnly = true)
    public Status status() {
        long me = currentUser.require(Role.STUDENT).userId();
        String current = noticeVersion();
        Consent last = consents(me).stream().findFirst().orElse(null);
        boolean upToDate = last != null && consents(me).stream().anyMatch(c -> c.version().equals(current));
        return new Status(current, last, upToDate, erasures(me).stream().findFirst().orElse(null));
    }

    /** Everything the system holds about the signed-in student, read through each feature's own port. */
    @Transactional // writes the audit entry
    public Export export() {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        long id = me.userId();
        Account account = jdbc.sql("SELECT display_name, email, locale, created_at FROM auth_user WHERE id = :id")
                .param("id", id).query((rs, i) -> new Account(rs.getString("display_name"), rs.getString("email"),
                        rs.getString("locale"), rs.getTimestamp("created_at").toInstant()))
                .single();
        Profile profile = jdbc.sql("""
                SELECT s.student_code, s.gender, s.date_of_birth, s.major, s.cohort, s.phone,
                       c.name AS e_name, c.relationship AS e_rel, c.phone AS e_phone
                FROM auth_student s
                LEFT JOIN LATERAL (SELECT name, relationship, phone FROM auth_student_emergency_contact
                                   WHERE student_id = s.user_id ORDER BY position LIMIT 1) c ON TRUE
                WHERE s.user_id = :id
                """).param("id", id).query((rs, i) -> new Profile(rs.getString("student_code"), rs.getString("gender"),
                        rs.getObject("date_of_birth", LocalDate.class), rs.getString("major"), rs.getString("cohort"),
                        rs.getString("phone"), rs.getString("e_name"), rs.getString("e_rel"), rs.getString("e_phone")))
                .optional().orElse(null);
        Map<String, List<StudentRecords.Item>> held = new LinkedHashMap<>();
        for (String section : List.of("applications", "allocations", "invoices", "requests")) {
            held.put(section, records.stream().filter(r -> r.section().equals(section))
                    .flatMap(r -> r.of(id, RECORDS_LIMIT).stream()).toList());
        }
        audit.record("PERSONAL_DATA_EXPORTED", AuditLog.Tone.INFO, "User", id, me.name(), Map.of());
        return new Export(Instant.now(clock), account, profile, refundAccounts.of(List.of(id)).get(id), consents(id),
                erasures(id), held);
    }

    @Transactional
    public Created requestErasure(String reason) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        String text = reason == null || reason.isBlank() ? null : reason.strip();
        if (text != null && text.length() > 500) {
            throw FieldErrors.single("reason", "Use at most 500 characters.");
        }
        jdbc.sql("SELECT id FROM auth_user WHERE id = :id FOR UPDATE").param("id", me.userId()).query(Long.class).single();
        if (erasures(me.userId()).stream().anyMatch(e -> e.status().equals("Pending"))) {
            throw ApiException.conflict("ERASURE_PENDING", "Your erasure request is already waiting for a Manager.");
        }
        long id = jdbc.sql("""
                INSERT INTO auth_erasure_request (student_id, reason, requested_at) VALUES (:s, :r, :now) RETURNING id
                """).param("s", me.userId()).param("r", text).param("now", Timestamp.from(Instant.now(clock)))
                .query(Long.class).single();
        audit.record("ERASURE_REQUESTED", AuditLog.Tone.INFO, "User", me.userId(), me.name(), Map.of("request", id));
        return new Created(String.valueOf(id), "Pending");
    }

    @Transactional(readOnly = true)
    public Page requests(String status, PageQuery page) {
        currentUser.require(Permission.MANAGE_STUDENTS);
        String code = status == null || status.isBlank() ? null
                : STATUS.entrySet().stream().filter(e -> e.getValue().equalsIgnoreCase(status.strip())
                        || e.getKey().equalsIgnoreCase(status.strip())).map(Map.Entry::getKey).findFirst()
                        .orElseThrow(() -> FieldErrors.single("status", "Choose Pending, Rejected or Completed."));
        long total = jdbc.sql("SELECT count(*) FROM auth_erasure_request WHERE (CAST(:st AS VARCHAR) IS NULL OR status = :st)")
                .param("st", code).query(Long.class).single();
        List<Row> items = jdbc.sql("""
                SELECT e.id, u.display_name, s.student_code, e.reason, e.status, e.requested_at, e.decided_at,
                       d.display_name AS decided_by, e.note
                FROM auth_erasure_request e JOIN auth_user u ON u.id = e.student_id
                LEFT JOIN auth_student s ON s.user_id = e.student_id
                LEFT JOIN auth_user d ON d.id = e.decided_by
                WHERE (CAST(:st AS VARCHAR) IS NULL OR e.status = :st)
                ORDER BY (e.status = 'PENDING') DESC, e.requested_at DESC
                LIMIT :limit OFFSET :offset
                """).param("st", code).param("limit", page.limit()).param("offset", page.offset())
                .query((rs, i) -> new Row(String.valueOf(rs.getLong("id")), rs.getString("display_name"),
                        rs.getString("student_code"), rs.getString("reason"), STATUS.get(rs.getString("status")),
                        rs.getTimestamp("requested_at").toInstant(), instant(rs.getTimestamp("decided_at")),
                        rs.getString("decided_by"), rs.getString("note")))
                .list();
        return new Page(items, total);
    }

    /**
     * Approve: anonymises the account (name, email, phone, date of birth, emergency contacts, refund account) and
     * ends its sessions, unless a stay or money still needs the data (the request then stays Pending). Reject: a note
     * is required.
     */
    @Transactional
    public void decide(String requestId, String decision, String note) {
        AuthenticatedUser user = currentUser.require(Permission.MANAGE_STUDENTS);
        long id = parse(requestId);
        record Target(long studentId, String status, String name) {
        }
        Target t = jdbc.sql("""
                SELECT e.student_id, e.status, u.display_name FROM auth_erasure_request e
                JOIN auth_user u ON u.id = e.student_id WHERE e.id = :id FOR UPDATE OF e, u
                """).param("id", id).query((rs, i) -> new Target(rs.getLong("student_id"), rs.getString("status"),
                        rs.getString("display_name")))
                .optional().orElseThrow(() -> ApiException.notFound("This erasure request does not exist."));
        if (!t.status().equals("PENDING")) {
            throw ApiException.conflict("ALREADY_DECIDED", "This erasure request has already been decided.");
        }
        String text = note == null || note.isBlank() ? null : note.strip();
        FieldErrors errors = new FieldErrors();
        boolean approve = "Approved".equalsIgnoreCase(decision);
        errors.check(approve || "Rejected".equalsIgnoreCase(decision), "decision", "Choose Approved or Rejected.");
        errors.check(approve || text != null, "note", "Write why the request is rejected.");
        errors.check(text == null || text.length() <= 500, "note", "Use at most 500 characters.");
        errors.throwIfAny();
        Timestamp now = Timestamp.from(Instant.now(clock));
        if (!approve) {
            jdbc.sql("UPDATE auth_erasure_request SET status = 'REJECTED', decided_at = :now, decided_by = :by, note = :note WHERE id = :id")
                    .param("now", now).param("by", user.userId()).param("note", text).param("id", id).update();
            audit.record("ERASURE_REJECTED", AuditLog.Tone.WARNING, "User", t.studentId(), t.name(),
                    Map.of("request", id, "note", text));
            return;
        }
        Optional<ErasureBlockers.Blocker> blocked = blockers.stream().map(b -> b.blocker(t.studentId()))
                .flatMap(Optional::stream).findFirst();
        if (blocked.isPresent()) {
            throw ApiException.conflict(blocked.get().code(), blocked.get().message());
        }
        jdbc.sql("""
                UPDATE auth_user SET display_name = 'Erased student', email = 'erased-' || id || '@erased.invalid',
                       password_hash = NULL, google_sub = NULL, status = 'DISABLED', updated_at = :now
                WHERE id = :s
                """).param("now", now).param("s", t.studentId()).update();
        jdbc.sql("""
                UPDATE auth_student SET phone = NULL, date_of_birth = NULL, emergency_name = NULL,
                       emergency_relationship = NULL, emergency_phone = NULL WHERE user_id = :s
                """).param("s", t.studentId()).update();
        jdbc.sql("DELETE FROM auth_student_emergency_contact WHERE student_id = :s").param("s", t.studentId()).update();
        jdbc.sql("DELETE FROM auth_session WHERE user_id = :s").param("s", t.studentId()).update();
        refundAccounts.clear(List.of(t.studentId()));
        jdbc.sql("UPDATE auth_erasure_request SET status = 'COMPLETED', decided_at = :now, decided_by = :by, note = :note WHERE id = :id")
                .param("now", now).param("by", user.userId()).param("note", text).param("id", id).update();
        // the label is the request id, not the erased name
        audit.record("PERSONAL_DATA_ERASED", AuditLog.Tone.WARNING, "User", t.studentId(), "Erasure request " + id,
                Map.of("request", id));
    }

    private List<Consent> consents(long userId) {
        return jdbc.sql("SELECT version, accepted_at FROM auth_consent WHERE user_id = :u ORDER BY accepted_at DESC, id DESC")
                .param("u", userId).query((rs, i) -> new Consent(rs.getString("version"),
                        rs.getTimestamp("accepted_at").toInstant()))
                .list();
    }

    private List<Erasure> erasures(long userId) {
        return jdbc.sql("""
                SELECT id, status, reason, requested_at, decided_at, note FROM auth_erasure_request
                WHERE student_id = :u ORDER BY requested_at DESC, id DESC
                """).param("u", userId).query((rs, i) -> new Erasure(String.valueOf(rs.getLong("id")),
                        STATUS.get(rs.getString("status")), rs.getString("reason"),
                        rs.getTimestamp("requested_at").toInstant(), instant(rs.getTimestamp("decided_at")),
                        rs.getString("note")))
                .list();
    }

    private static long parse(String id) {
        try {
            return Long.parseLong(Objects.requireNonNull(id).strip());
        } catch (RuntimeException e) {
            throw ApiException.notFound("This erasure request does not exist.");
        }
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
