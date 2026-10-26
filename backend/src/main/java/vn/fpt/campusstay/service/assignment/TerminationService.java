package vn.fpt.campusstay.service.assignment;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.Actor;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.event.ResidentLeftRoom;
import vn.fpt.campusstay.event.TerminationCancelled;
import vn.fpt.campusstay.event.TerminationOverdue;
import vn.fpt.campusstay.event.TerminationStarted;
import vn.fpt.campusstay.event.UtilityTerminationDue;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * Terminations of a stay (*buộc rời*, spec §6.15, D-27): Utility debt (automatic, from Billing's rule), not enrolled,
 * or a Manager's decision with a reason. Notice sent → the student checks out at the desk by the move-out date
 * ({@code termination.move_out_days} after the start): Checked out; or a Manager cancels with a reason; or the date
 * passes: Overdue, Managers and the Block's Staff are told and the Room's door code is rotated, so the student can no
 * longer open the door. At the check-out the unused room fee is refunded by the rule (Termination, default 0 %;
 * Not enrolled, configurable) and the Utility Deposit settles the debt (the rest stays an Invoice).
 */
@Service
public class TerminationService {

    public record TerminationItem(String id, String studentName, String studentCode, String room, String block,
            String reason, String note, String status, LocalDate moveOutBy, Instant startedAt, String startedBy,
            Long debt, Instant endedAt, String cancelReason) {
    }

    public record Counts(long noticeSent, long overdue) {
    }

    public record TerminationPage(List<TerminationItem> items, long total, Counts counts, List<String> reasons,
            List<String> statuses) {
    }

    /** @param reason {@code Manager decision} or {@code Not enrolled} */
    public record StartCommand(String studentCode, String reason, String note) {
    }

    public record Started(String id, LocalDate moveOutBy) {
    }

    /** What the student sees on My Room. */
    public record MyTermination(String reason, String note, String status, LocalDate moveOutBy, Instant startedAt) {
    }

    static final Map<String, String> REASONS = Map.of("UTILITY_DEBT", "Utility debt", "NOT_ENROLLED", "Not enrolled",
            "MANAGER", "Manager decision");
    static final Map<String, String> STATUSES = Map.of("NOTICE_SENT", "Notice sent", "OVERDUE", "Overdue",
            "CHECKED_OUT", "Checked out", "CANCELLED", "Cancelled");

    private record Row(long id, long allocationId, long termId, long studentId, long bedId, String reason, String note,
            Long debt, String status, Instant startedAt, Long startedBy, LocalDate moveOutBy, Instant endedAt,
            String cancelReason) {
    }

    private record Resident(long id, long termId, long studentId, Long applicationId, long bedId) {
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final TermCatalog terms;
    private final Inventory inventory;
    private final UserDirectory users;
    private final Billing billing;
    private final Parameters parameters;
    private final JdbcStays stays;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public TerminationService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, TermCatalog terms,
            Inventory inventory, UserDirectory users, Billing billing, Parameters parameters, JdbcStays stays,
            ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.stays = stays;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.terms = terms;
        this.inventory = inventory;
        this.users = users;
        this.billing = billing;
        this.parameters = parameters;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- lists

    /** Managers (every Block) and Staff (their Blocks, read only). @param status a label of {@code statuses} */
    @Transactional(readOnly = true)
    public TerminationPage list(Long termId, String block, String status, PageQuery page) {
        currentUser.require(Permission.VIEW_STUDENTS);
        Set<Long> scope = blockScope.resolve(block).ids();
        String code = status == null || status.isBlank() ? null : STATUSES.entrySet().stream()
                .filter(e -> e.getValue().equalsIgnoreCase(status.trim())).map(Map.Entry::getKey).findFirst()
                .orElseThrow(() -> FieldErrors.single("status", "Choose Notice sent, Overdue, Checked out or Cancelled."));
        Map<String, Object> params = new HashMap<>();
        String where = "";
        if (termId != null) {
            TermSummary term = terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
            where = " WHERE t.term_id = :term";
            params.put("term", term.id());
        }
        List<Row> rows = jdbc.sql(SELECT + where + " ORDER BY (t.status IN ('NOTICE_SENT', 'OVERDUE')) DESC, t.move_out_by, t.id")
                .params(params).query(TerminationService::row).list();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(rows.stream().map(Row::bedId).toList());
        List<Row> visible = rows.stream().filter(r -> beds.get(r.bedId()) != null
                && scope.contains(beds.get(r.bedId()).buildingId())).toList();
        Counts counts = new Counts(visible.stream().filter(r -> r.status().equals("NOTICE_SENT")).count(),
                visible.stream().filter(r -> r.status().equals("OVERDUE")).count());
        List<Row> shown = visible.stream().filter(r -> code == null || r.status().equals(code)).toList();
        List<Row> pageRows = shown.stream().skip(page.offset()).limit(page.limit()).toList();
        Map<Long, UserDirectory.Student> students = users.students(pageRows.stream().map(Row::studentId).toList());
        Map<Long, String> starters = users.displayNames(pageRows.stream().map(Row::startedBy).filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        List<TerminationItem> items = new ArrayList<>();
        for (Row r : pageRows) {
            UserDirectory.Student s = students.get(r.studentId());
            Inventory.BedSlot bed = beds.get(r.bedId());
            items.add(new TerminationItem(String.valueOf(r.id()), s == null ? null : s.name(),
                    s == null ? null : s.studentCode(), bed.roomCode(), bed.block(), REASONS.get(r.reason()), r.note(),
                    STATUSES.get(r.status()), r.moveOutBy(), r.startedAt(),
                    r.startedBy() == null ? "System" : starters.get(r.startedBy()), r.debt(), r.endedAt(),
                    r.cancelReason()));
        }
        return new TerminationPage(items, shown.size(), counts, List.of("Manager decision", "Not enrolled"),
                List.copyOf(List.of("Notice sent", "Overdue", "Checked out", "Cancelled")));
    }

    /** The student's open (or last) termination of the Allocation, for My Room. */
    @Transactional(readOnly = true)
    public Optional<MyTermination> ofAllocation(long allocationId) {
        return jdbc.sql(SELECT + " WHERE t.allocation_id = :a ORDER BY t.id DESC LIMIT 1").param("a", allocationId)
                .query(TerminationService::row).optional()
                .filter(r -> !r.status().equals("CANCELLED"))
                .map(r -> new MyTermination(REASONS.get(r.reason()), r.reason().equals("MANAGER") ? r.note() : null,
                        STATUSES.get(r.status()), r.moveOutBy(), r.startedAt()));
    }

    // ---------------------------------------------------------------- start and cancel

    /** A Manager terminates a resident's stay. */
    @Transactional
    public Started start(StartCommand cmd) {
        AuthenticatedUser user = currentUser.require(Permission.TERMINATE_STAYS);
        FieldErrors errors = new FieldErrors();
        String reason = cmd.reason() == null ? "" : cmd.reason().trim().toLowerCase(Locale.ROOT);
        String code = reason.equals("manager decision") || reason.equals("manager") ? "MANAGER"
                : reason.equals("not enrolled") || reason.equals("not_enrolled") ? "NOT_ENROLLED" : null;
        errors.check(code != null, "reason", "Choose Manager decision or Not enrolled.");
        String note = cmd.note() == null || cmd.note().isBlank() ? null : cmd.note().trim();
        errors.check(note == null || note.length() <= 500, "note", "Keep the note under 500 characters.");
        errors.check(!"MANAGER".equals(code) || note != null, "note", "Write why the stay is terminated.");
        errors.throwIfAny();
        UserDirectory.StudentProfile student = users.studentByCode(cmd.studentCode() == null ? "" : cmd.studentCode().trim())
                .orElseThrow(() -> ApiException.notFound("This student does not live in the dormitory."));
        Resident a = resident(student.userId(), null)
                .orElseThrow(() -> ApiException.notFound("This student does not live in the dormitory."));
        blockScope.check(inventory.beds(List.of(a.bedId())).get(a.bedId()).buildingId());
        long id = insert(a, code, note, null, user.userId());
        return new Started(String.valueOf(id), moveOutBy(id));
    }

    /** Billing's Utility debt rule fired (same transaction). */
    @EventListener
    void on(UtilityTerminationDue e) {
        resident(e.studentId(), e.allocationId()).ifPresent(a -> insertQuietly(a, "UTILITY_DEBT", null, e.debt()));
    }

    /**
     * A Manager reconciled the enrolled list and found a resident of the Term not enrolled (spec §6.12; the caller's
     * transaction): their stay is terminated with the reason Not enrolled and the Manager's note.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    void notEnrolled(long studentId, long termId, String note) {
        resident(studentId, null).filter(a -> a.termId() == termId)
                .filter(a -> !terminated(a.id()))
                .ifPresent(a -> insert(a, "NOT_ENROLLED", note, null, currentUser.id()));
    }

    /** Only a Manager cancels a termination, with a reason (spec §6.14). */
    @Transactional
    public void cancel(String id, String reason) {
        AuthenticatedUser user = currentUser.require(Permission.TERMINATE_STAYS);
        String why = reason == null ? "" : reason.trim();
        if (why.isEmpty()) {
            throw FieldErrors.single("reason", "Write why the termination is cancelled.");
        }
        if (why.length() > 500) {
            throw FieldErrors.single("reason", "Keep the reason under 500 characters.");
        }
        Row r = parse(id).flatMap(n -> jdbc.sql(SELECT + " WHERE t.id = :id FOR UPDATE OF t").param("id", n)
                .query(TerminationService::row).optional())
                .orElseThrow(() -> ApiException.notFound("This termination does not exist."));
        Inventory.BedSlot bed = inventory.beds(List.of(r.bedId())).get(r.bedId());
        blockScope.check(bed.buildingId());
        if (!r.status().equals("NOTICE_SENT") && !r.status().equals("OVERDUE")) {
            throw ApiException.conflict("TERMINATION_CLOSED", "This termination is already closed.");
        }
        Instant now = Instant.now(clock);
        jdbc.sql("""
                UPDATE asg_termination SET status = 'CANCELLED', cancel_reason = :why, ended_at = :now, ended_by = :by,
                       version = version + 1
                WHERE id = :id
                """).param("why", why).param("now", Timestamp.from(now)).param("by", user.userId())
                .param("id", r.id()).update();
        jdbc.sql("DELETE FROM asg_check_out WHERE allocation_id = :a AND status = 'PENDING' AND reason = 'TERMINATION'")
                .param("a", r.allocationId()).update();
        audit.record("TERMINATION_CANCELLED", AuditLog.Tone.INFO, "Allocation", r.allocationId(),
                "Room " + bed.roomCode() + " · Bed " + bed.bedLabel(), Map.of("reason", why));
        events.publishEvent(new TerminationCancelled(r.id(), r.studentId(), bed.roomCode()));
    }

    // ---------------------------------------------------------------- the move-out date and the desk

    /** Notices past their move-out date become Overdue: Managers and Staff are told, the door code rotates. */
    @Transactional
    public int markOverdue() {
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        Instant now = Instant.now(clock);
        List<Row> due = jdbc.sql(SELECT + " WHERE t.status = 'NOTICE_SENT' AND t.move_out_by < :today FOR UPDATE OF t SKIP LOCKED")
                .param("today", today).query(TerminationService::row).list();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(due.stream().map(Row::bedId).toList());
        Map<Long, String> names = users.displayNames(due.stream().map(Row::studentId).toList());
        for (Row r : due) {
            jdbc.sql("UPDATE asg_termination SET status = 'OVERDUE', overdue_at = :now, version = version + 1 WHERE id = :id")
                    .param("now", Timestamp.from(now)).param("id", r.id()).update();
            Inventory.BedSlot bed = beds.get(r.bedId());
            audit.record(Actor.SYSTEM, "TERMINATION_OVERDUE", AuditLog.Tone.DANGER, "Allocation", r.allocationId(),
                    bed == null ? null : "Room " + bed.roomCode() + " · Bed " + bed.bedLabel(),
                    Map.of("moveOutBy", r.moveOutBy().toString()));
            if (bed != null) {
                events.publishEvent(new ResidentLeftRoom(bed.roomId(), "TERMINATION"));
                events.publishEvent(new TerminationOverdue(r.id(), r.studentId(), names.get(r.studentId()),
                        bed.roomCode(), bed.buildingId(), r.moveOutBy()));
            }
            endNextTerm(r.studentId());
        }
        return due.size();
    }

    /**
     * The terminated student checked out at the desk (Desk's transaction): the termination closes and the unused room
     * fee is refunded by its rule. @return whether a termination closed
     */
    @Transactional(propagation = Propagation.MANDATORY)
    boolean checkedOut(long allocationId, long by) {
        Optional<Row> open = jdbc.sql(SELECT + " WHERE t.allocation_id = :a AND t.status IN ('NOTICE_SENT', 'OVERDUE') FOR UPDATE OF t")
                .param("a", allocationId).query(TerminationService::row).optional();
        if (open.isEmpty()) {
            return false;
        }
        Row r = open.get();
        Instant now = Instant.now(clock);
        jdbc.sql("""
                UPDATE asg_termination SET status = 'CHECKED_OUT', ended_at = :now, ended_by = :by, version = version + 1
                WHERE id = :id
                """).param("now", Timestamp.from(now)).param("by", by).param("id", r.id()).update();
        TermSummary term = terms.findPublished(r.termId()).orElse(null);
        Inventory.BedSlot bed = inventory.beds(List.of(r.bedId())).get(r.bedId());
        Long applicationId = jdbc.sql("SELECT application_id FROM asg_allocation WHERE id = :a").param("a", allocationId)
                .query((rs, i) -> Optional.ofNullable(rs.getObject("application_id", Long.class))).single().orElse(null);
        if (term != null && term.stayStart() != null && term.stayEnd() != null) {
            billing.refundUnusedRoomFee(new Billing.UnusedFeeRefund(r.termId(), r.studentId(), allocationId,
                    applicationId, bed == null ? null : bed.buildingId(), "TERMINATION", r.id(),
                    "Unused room fee · " + REASONS.get(r.reason()) + (bed == null ? "" : " · Room " + bed.roomCode()),
                    r.reason().equals("NOT_ENROLLED") ? "NOT_ENROLLED" : "TERMINATION",
                    LocalDate.ofInstant(now, TimeConfig.CAMPUS_ZONE), term.stayStart(), term.stayEnd()));
        }
        return true;
    }

    /** At move-out the next-Term Allocation ends with the stay (spec §6.15). */
    private void endNextTerm(long studentId) {
        jdbc.sql("SELECT id FROM asg_allocation WHERE student_id = :s AND status = 'ACTIVE' AND renewal IS NOT NULL")
                .param("s", studentId).query(Long.class).list().forEach(id -> stays.cancel(id, "TERMINATED"));
    }

    // ---------------------------------------------------------------- helpers

    private static final String SELECT = """
            SELECT t.*, a.bed_id FROM asg_termination t JOIN asg_allocation a ON a.id = t.allocation_id
            """;

    /** The student's active Allocation as a resident: the one given, else the latest. */
    private Optional<Resident> resident(long studentId, Long allocationId) {
        return jdbc.sql("""
                SELECT id, term_id, student_id, application_id, bed_id FROM asg_allocation
                WHERE student_id = :student AND status = 'ACTIVE' AND resident_at IS NOT NULL
                ORDER BY (id = :preferred) DESC, allocated_at DESC LIMIT 1 FOR UPDATE
                """).param("student", studentId).param("preferred", allocationId == null ? -1L : allocationId)
                .query((rs, i) -> new Resident(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("student_id"),
                        rs.getObject("application_id", Long.class), rs.getLong("bed_id")))
                .optional();
    }

    /** A stay already terminated keeps its open termination. */
    private void insertQuietly(Resident a, String reason, String note, Long debt) {
        if (!terminated(a.id())) {
            insert(a, reason, note, debt, null);
        }
    }

    private boolean terminated(long allocationId) {
        return jdbc.sql("SELECT count(*) FROM asg_termination WHERE allocation_id = :a AND status IN ('NOTICE_SENT', 'OVERDUE')")
                .param("a", allocationId).query(Long.class).single() > 0;
    }

    private long insert(Resident a, String reason, String note, Long debt, Long by) {
        if (terminated(a.id())) {
            throw ApiException.conflict("ALREADY_TERMINATED", "This stay is already terminated.");
        }
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        LocalDate moveOutBy = today.plusDays(Math.max(0, parameters.intValue("termination.move_out_days")));
        Instant now = Instant.now(clock);
        long id;
        try {
            id = jdbc.sql("""
                    INSERT INTO asg_termination (allocation_id, term_id, student_id, reason, note, debt, started_at,
                                                 started_by, move_out_by)
                    VALUES (:a, :term, :student, :reason, :note, :debt, :now, :by, :moveOutBy) RETURNING id
                    """)
                    .param("a", a.id()).param("term", a.termId()).param("student", a.studentId()).param("reason", reason)
                    .param("note", note).param("debt", debt).param("now", Timestamp.from(now)).param("by", by)
                    .param("moveOutBy", moveOutBy).query(Long.class).single();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("ALREADY_TERMINATED", "This stay is already terminated.");
        }
        // The student appears on the check-out list with the reason Termination.
        jdbc.sql("""
                INSERT INTO asg_check_out (allocation_id, reason, status) VALUES (:a, 'TERMINATION', 'PENDING')
                ON CONFLICT (allocation_id) DO UPDATE SET reason = 'TERMINATION' WHERE asg_check_out.status <> 'COMPLETED'
                """).param("a", a.id()).update();
        Inventory.BedSlot bed = inventory.beds(List.of(a.bedId())).get(a.bedId());
        String label = bed == null ? null : "Room " + bed.roomCode() + " · Bed " + bed.bedLabel();
        Map<String, Object> change = new HashMap<>();
        change.put("reason", REASONS.get(reason));
        change.put("moveOutBy", moveOutBy.toString());
        if (note != null) {
            change.put("note", note);
        }
        if (debt != null) {
            change.put("debt", debt);
        }
        if (by == null) {
            audit.record(Actor.SYSTEM, "TERMINATION_STARTED", AuditLog.Tone.DANGER, "Allocation", a.id(), label, change);
        } else {
            audit.record("TERMINATION_STARTED", AuditLog.Tone.DANGER, "Allocation", a.id(), label, change);
        }
        events.publishEvent(new TerminationStarted(id, a.id(), a.studentId(), bed == null ? null : bed.roomCode(), reason,
                moveOutBy));
        return id;
    }

    private LocalDate moveOutBy(long id) {
        return jdbc.sql("SELECT move_out_by FROM asg_termination WHERE id = :id").param("id", id)
                .query(LocalDate.class).single();
    }

    private static Optional<Long> parse(String value) {
        if (value == null || value.isBlank() || value.length() > 18 || !value.trim().chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(value.trim()));
    }

    private static Row row(ResultSet rs, int i) throws SQLException {
        Timestamp ended = rs.getTimestamp("ended_at");
        return new Row(rs.getLong("id"), rs.getLong("allocation_id"), rs.getLong("term_id"), rs.getLong("student_id"),
                rs.getLong("bed_id"), rs.getString("reason"), rs.getString("note"), rs.getObject("debt", Long.class),
                rs.getString("status"), rs.getTimestamp("started_at").toInstant(), rs.getObject("started_by", Long.class),
                rs.getObject("move_out_by", LocalDate.class), ended == null ? null : ended.toInstant(),
                rs.getString("cancel_reason"));
    }
}
