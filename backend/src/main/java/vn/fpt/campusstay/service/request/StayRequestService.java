package vn.fpt.campusstay.service.request;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.event.NextTermRequestDecided;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.assignment.Moves;
import vn.fpt.campusstay.service.assignment.Stays;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * Extension and end of stay (D-13, D-30, spec §6.10). In the requests window a continuing resident adds Terms to their
 * Stay (needed in its last Term to keep the Bed: Awaiting extension → Continuing) or ends it after the current Term
 * (free when asked before the request deadline: the next-Term Allocation is cancelled and the Bed is free). An
 * extension is approved at once when {@code stay.auto_extension} is on, the student is enrolled and owes nothing
 * overdue; otherwise Staff of the Block decide it by M4. Addressed as {@code ST-SU31-000007}.
 */
@Service
public class StayRequestService {

    public record Created(String id, String status, boolean automatic, String note) {
    }

    /** @param kind {@code Extension} or {@code End of stay}; {@code terms} the Terms added (extensions) */
    public record Item(String id, String kind, String studentName, String studentCode, String room, String block,
            Integer terms, int committedTerms, int termsUsed, String reason, String status, boolean automatic,
            Instant submittedAt, Instant dueAt, String decisionNote, String decidedBy, Instant decidedAt) {
    }

    public record ItemPage(List<Item> items, long total, RoomChangeService.Window window) {
    }

    private record Request(long id, String code, long termId, long studentId, long allocationId, long buildingId,
            String kind, Integer extraTerms, String reason, String status, boolean automatic, Instant dueAt,
            Long decidedBy, Instant decidedAt, String decisionNote, Instant submittedAt) {
    }

    private static final Map<String, String> STATUSES = Map.of("SUBMITTED", "Pending", "APPROVED", "Approved",
            "REJECTED", "Rejected", "CANCELLED", "Cancelled");
    private static final Map<String, String> KINDS = Map.of("EXTENSION", "Extension", "END_OF_STAY", "End of stay");

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final NextTermContext context;
    private final Stays stays;
    private final Moves moves;
    private final UserDirectory users;
    private final Billing billing;
    private final Parameters parameters;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public StayRequestService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, NextTermContext context,
            Stays stays, Moves moves, UserDirectory users, Billing billing, Parameters parameters,
            ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.context = context;
        this.stays = stays;
        this.moves = moves;
        this.users = users;
        this.billing = billing;
        this.parameters = parameters;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- student

    /** Adds {@code terms} Terms to the student's Stay; approved at once when the student may extend. */
    @Transactional
    public Created extend(Integer terms, String reason) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        NextTermContext.Filing f = context.filing(me.userId());
        int max = stays.maxStayTerms();
        int room = max - f.nextTerm().committedTerms();
        FieldErrors errors = new FieldErrors();
        errors.check(terms != null && terms >= 1 && terms <= 9, "terms", "Choose 1 to 9 Terms.");
        String why = reason == null || reason.isBlank() ? null : reason.trim();
        errors.check(why == null || why.length() <= 500, "reason", "Keep the reason under 500 characters.");
        errors.throwIfAny();
        if (terms > room) {
            throw FieldErrors.single("terms", room <= 0 ? "Your stay already has the most Terms allowed (" + max + ")."
                    : "You can add at most " + room + " Terms (a stay has at most " + max + ").");
        }
        Optional<String> blocked = autoBlocked(me.userId());
        boolean automatic = blocked.isEmpty();
        Instant now = Instant.now(clock);
        long id = insert(f, me.userId(), "EXTENSION", terms, why, automatic ? "APPROVED" : "SUBMITTED", automatic, now);
        String note;
        if (automatic) {
            stays.extend(f.nextTerm().allocationId(), terms);
            note = "Your stay is extended by " + terms + (terms == 1 ? " Term" : " Terms") + ". Your Bed is kept for "
                    + f.window().termName() + ".";
            decided(id, null, now, note);
        } else {
            note = "Staff decide your extension by " + NextTermContext.when(f.window().decisionsDueAt()) + " ("
                    + blocked.get() + ").";
        }
        audit.record("STAY_EXTENSION_REQUESTED", AuditLog.Tone.INFO, "Stay request", id, code(id),
                Map.of("terms", terms, "automatic", automatic));
        return new Created(code(id), STATUSES.get(automatic ? "APPROVED" : "SUBMITTED"), automatic, note);
    }

    /** Ends the stay after the current Term: the Bed kept for the next Term is released at once. */
    @Transactional
    public Created endOfStay(String reason) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        NextTermContext.Filing f = context.filing(me.userId());
        String why = reason == null || reason.isBlank() ? null : reason.trim();
        if (why != null && why.length() > 500) {
            throw FieldErrors.single("reason", "Keep the reason under 500 characters.");
        }
        Instant now = Instant.now(clock);
        long id = insert(f, me.userId(), "END_OF_STAY", null, why, "APPROVED", true, now);
        String note = "Your stay ends after the current Term. Check out at the desk by "
                + (f.window().previousCheckOutBy() == null ? "the check-out day"
                        : f.window().previousCheckOutBy().format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")))
                + ".";
        decided(id, null, now, note);
        stays.endAfterThisTerm(f.nextTerm().allocationId());
        audit.record("STAY_ENDED_BY_STUDENT", AuditLog.Tone.INFO, "Stay request", id, code(id),
                why == null ? null : Map.of("reason", why));
        return new Created(code(id), STATUSES.get("APPROVED"), true, note);
    }

    @Transactional(readOnly = true)
    public List<RoomChangeService.StudentItem> ofStudent(long studentId, Long termId) {
        return jdbc.sql("SELECT * FROM req_stay_request WHERE student_id = :s"
                + (termId != null ? " AND term_id = :t" : "") + " ORDER BY submitted_at DESC, id DESC")
                .params(termId != null ? Map.of("s", studentId, "t", termId) : Map.of("s", studentId))
                .query(StayRequestService::request).list().stream()
                .map(r -> new RoomChangeService.StudentItem(r.code(), KINDS.get(r.kind()),
                        r.kind().equals("EXTENSION") ? "+" + r.extraTerms() + (r.extraTerms() == 1 ? " Term" : " Terms")
                                : "After the current Term",
                        r.submittedAt(), STATUSES.get(r.status()),
                        r.decisionNote() == null ? null
                                : new RoomChangeService.StudentDecision(r.decisionNote(), r.decidedAt()),
                        null, null, null))
                .toList();
    }

    // ---------------------------------------------------------------- Staff and Managers

    /** @param kind {@code Extension} or {@code End of stay}; {@code status} a status label */
    @Transactional(readOnly = true)
    public ItemPage list(Long termId, String block, String kind, String status, PageQuery page) {
        currentUser.require(Permission.DECIDE_ROOM_CHANGES);
        Set<Long> scope = blockScope.resolve(block).ids();
        long term = termOf(termId);
        Map<String, Object> params = new HashMap<>();
        params.put("term", term);
        params.put("scope", List.copyOf(scope));
        StringBuilder where = new StringBuilder(" WHERE term_id = :term AND building_id IN (:scope)");
        if (kind != null && !kind.isBlank()) {
            where.append(" AND kind = :kind");
            params.put("kind", code(KINDS, kind, "kind", "Choose Extension or End of stay."));
        }
        if (status != null && !status.isBlank()) {
            where.append(" AND status = :status");
            params.put("status", code(STATUSES, status, "status", "Choose Pending, Approved, Rejected or Cancelled."));
        }
        long total = jdbc.sql("SELECT count(*) FROM req_stay_request" + where).params(params).query(Long.class).single();
        params.put("limit", page.limit());
        params.put("offset", page.offset());
        List<Request> rows = jdbc.sql("SELECT * FROM req_stay_request" + where + """
                 ORDER BY (status = 'SUBMITTED') DESC, submitted_at DESC, id DESC LIMIT :limit OFFSET :offset
                """).params(params).query(StayRequestService::request).list();
        return new ItemPage(items(rows), total, context.window(term).map(RoomChangeService::window).orElse(null));
    }

    /** Staff of the Block decide an extension that was not approved at once: approve, or reject with a note. */
    @Transactional
    public Item decide(String id, String decision, String note) {
        AuthenticatedUser user = currentUser.require(Permission.DECIDE_ROOM_CHANGES);
        Request r = find(id, true).orElseThrow(StayRequestService::notFound);
        if (!blockScope.resolve(null).ids().contains(r.buildingId())) {
            throw ApiException.forbidden("BLOCK_OUT_OF_SCOPE", "You do not have access to this Block.");
        }
        if (!r.status().equals("SUBMITTED")) {
            throw ApiException.conflict("ALREADY_DECIDED", "This request was already decided.");
        }
        String text = note == null || note.isBlank() ? null : note.trim();
        if (text != null && text.length() > 1000) {
            throw FieldErrors.single("note", "Keep the note under 1,000 characters.");
        }
        Instant now = Instant.now(clock);
        String d = decision == null ? "" : decision.trim();
        if (d.equalsIgnoreCase("rejected")) {
            if (text == null) {
                throw FieldErrors.single("note", "Write why the extension is rejected. The student sees it.");
            }
            jdbc.sql("""
                    UPDATE req_stay_request SET status = 'REJECTED', decided_by = :by, decided_at = :now,
                           decision_note = :note, version = version + 1
                    WHERE id = :id
                    """).param("by", user.userId()).param("now", Timestamp.from(now)).param("note", text)
                    .param("id", r.id()).update();
            audit.record("STAY_EXTENSION_REJECTED", AuditLog.Tone.WARNING, "Stay request", r.id(), r.code(),
                    Map.of("note", text));
            events.publishEvent(new NextTermRequestDecided(List.of(r.studentId()), "Extension", "rejected", text));
            return items(List.of(find(r.code(), false).orElseThrow())).getFirst();
        }
        if (!d.equalsIgnoreCase("approved")) {
            throw FieldErrors.single("decision", "Choose Approved or Rejected.");
        }
        context.checkDeciding(r.termId());
        stays.extend(r.allocationId(), r.extraTerms());
        String decided = text != null ? text : "Your stay is extended by " + r.extraTerms()
                + (r.extraTerms() == 1 ? " Term." : " Terms.");
        decided(r.id(), user.userId(), now, decided);
        audit.record("STAY_EXTENSION_APPROVED", AuditLog.Tone.SUCCESS, "Stay request", r.id(), r.code(),
                Map.of("terms", r.extraTerms()));
        events.publishEvent(new NextTermRequestDecided(List.of(r.studentId()), "Extension", "approved", decided));
        return items(List.of(find(r.code(), false).orElseThrow())).getFirst();
    }

    // ---------------------------------------------------------------- the window

    long openCount(long termId) {
        return jdbc.sql("SELECT count(*) FROM req_stay_request WHERE term_id = :t AND status = 'SUBMITTED'")
                .param("t", termId).query(Long.class).single();
    }

    List<Item> open(long termId, Set<Long> scope) {
        return items(jdbc.sql("""
                SELECT * FROM req_stay_request WHERE term_id = :t AND status = 'SUBMITTED' AND building_id IN (:scope)
                ORDER BY submitted_at, id
                """).param("t", termId).param("scope", List.copyOf(scope)).query(StayRequestService::request).list());
    }

    /** A next-Term Allocation was cancelled: an extension waiting for it has nothing to extend. */
    void allocationCancelled(long allocationId, Instant now) {
        jdbc.sql("""
                UPDATE req_stay_request SET status = 'CANCELLED', decided_at = :now, version = version + 1,
                       decision_note = 'The Bed for the next Term was released.'
                WHERE allocation_id = :a AND status = 'SUBMITTED'
                """).param("now", Timestamp.from(now)).param("a", allocationId).update();
    }

    // ---------------------------------------------------------------- helpers

    /** Why an extension cannot be approved at once (D-30), empty when it can. */
    private Optional<String> autoBlocked(long studentId) {
        if (!Boolean.parseBoolean(parameters.textValue("stay.auto_extension"))) {
            return Optional.of("extensions are decided by Staff");
        }
        boolean enrolled = users.studentProfile(studentId).map(p -> "ENROLLED".equals(p.enrollmentStatus()))
                .orElse(false);
        if (!enrolled) {
            return Optional.of("your enrollment must be checked");
        }
        if (billing.hasOverdueInvoice(studentId)) {
            return Optional.of("you have an overdue Invoice");
        }
        return Optional.empty();
    }

    private long insert(NextTermContext.Filing f, long studentId, String kind, Integer terms, String reason,
            String status, boolean automatic, Instant now) {
        try {
            return jdbc.sql("""
                    WITH next AS (SELECT nextval(pg_get_serial_sequence('req_stay_request', 'id')) AS id)
                    INSERT INTO req_stay_request (id, code, term_id, student_id, allocation_id, building_id, kind,
                                                  extra_terms, reason, status, automatic, sla_due_at, submitted_at)
                    OVERRIDING SYSTEM VALUE
                    SELECT id, 'ST-' || :termCode || '-' || lpad(id::text, greatest(6, length(id::text)), '0'), :term,
                           :student, :allocation, :building, :kind, :terms, :reason, :status, :automatic, :due, :now
                    FROM next
                    RETURNING id
                    """).param("termCode", f.window().termCode()).param("term", f.window().termId())
                    .param("student", studentId).param("allocation", f.nextTerm().allocationId())
                    .param("building", f.placement().buildingId()).param("kind", kind).param("terms", terms)
                    .param("reason", reason).param("status", status).param("automatic", automatic)
                    .param("due", Timestamp.from(f.window().decisionsDueAt())).param("now", Timestamp.from(now))
                    .query(Long.class).single();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("OPEN_REQUEST", "You already have an extension waiting for Staff.");
        }
    }

    private void decided(long id, Long by, Instant now, String note) {
        jdbc.sql("""
                UPDATE req_stay_request SET status = 'APPROVED', decided_by = :by, decided_at = :now,
                       decision_note = :note, version = version + 1
                WHERE id = :id
                """).param("by", by).param("now", Timestamp.from(now)).param("note", note).param("id", id).update();
    }

    private List<Item> items(List<Request> rows) {
        Map<Long, UserDirectory.Student> students = users.students(rows.stream().map(Request::studentId).toList());
        Map<Long, String> deciders = users.displayNames(rows.stream().map(Request::decidedBy).filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        Map<Long, Moves.Placement> placed = moves.placements(rows.stream().map(Request::allocationId).toList());
        Map<Long, Stays.StayView> stayOf = new HashMap<>();
        rows.forEach(r -> stays.stayOf(r.studentId()).ifPresent(s -> stayOf.put(r.studentId(), s)));
        return rows.stream().map(r -> {
            UserDirectory.Student s = students.get(r.studentId());
            Moves.Placement p = placed.get(r.allocationId());
            Stays.StayView stay = stayOf.get(r.studentId());
            return new Item(r.code(), KINDS.get(r.kind()), s == null ? null : s.name(), s == null ? null : s.studentCode(),
                    p == null ? null : p.room() + " · " + p.bed(), p == null ? null : p.block(), r.extraTerms(),
                    stay == null ? 0 : stay.committedTerms(), stay == null ? 0 : stay.termsUsed(), r.reason(),
                    STATUSES.get(r.status()), r.automatic(), r.submittedAt(), r.dueAt(), r.decisionNote(),
                    r.decidedBy() == null ? null : deciders.get(r.decidedBy()), r.decidedAt());
        }).toList();
    }

    private long termOf(Long termId) {
        if (termId != null) {
            return context.window(termId).map(Stays.Window::termId).orElseThrow(() -> ApiException.notFound(
                    "This Term has no requests window: it has no renewal milestones."));
        }
        return context.current().map(Stays.Window::termId)
                .orElseThrow(() -> ApiException.notFound("No requests window is open."));
    }

    private Optional<Request> find(String id, boolean lock) {
        if (id == null || id.isBlank() || id.length() > 24) {
            return Optional.empty();
        }
        String value = id.trim();
        boolean numeric = value.chars().allMatch(Character::isDigit);
        return jdbc.sql("SELECT * FROM req_stay_request WHERE " + (numeric ? "id = :v" : "upper(code) = upper(:v)")
                + (lock ? " FOR UPDATE" : ""))
                .param("v", numeric ? (Object) Long.parseLong(value) : value).query(StayRequestService::request)
                .optional();
    }

    private String code(long id) {
        return jdbc.sql("SELECT code FROM req_stay_request WHERE id = :id").param("id", id).query(String.class).single();
    }

    private static String code(Map<String, String> labels, String value, String field, String message) {
        return labels.entrySet().stream().filter(e -> e.getValue().equalsIgnoreCase(value.trim())
                || e.getKey().equalsIgnoreCase(value.trim().replace(' ', '_'))).map(Map.Entry::getKey).findFirst()
                .orElseThrow(() -> FieldErrors.single(field, message));
    }

    private static ApiException notFound() {
        return ApiException.notFound("This request does not exist.");
    }

    private static Request request(ResultSet rs, int i) throws SQLException {
        Timestamp due = rs.getTimestamp("sla_due_at");
        Timestamp decided = rs.getTimestamp("decided_at");
        return new Request(rs.getLong("id"), rs.getString("code"), rs.getLong("term_id"), rs.getLong("student_id"),
                rs.getLong("allocation_id"), rs.getLong("building_id"), rs.getString("kind"),
                rs.getObject("extra_terms", Integer.class), rs.getString("reason"), rs.getString("status"),
                rs.getBoolean("automatic"), due == null ? null : due.toInstant(),
                rs.getObject("decided_by", Long.class), decided == null ? null : decided.toInstant(),
                rs.getString("decision_note"), rs.getTimestamp("submitted_at").toInstant());
    }
}
