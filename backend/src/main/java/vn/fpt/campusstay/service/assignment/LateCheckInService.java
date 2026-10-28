package vn.fpt.campusstay.service.assignment;

import java.sql.Timestamp;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
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

import vn.fpt.campusstay.event.LateCheckInDecided;
import vn.fpt.campusstay.event.LateCheckInRequested;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.common.file.FileLinks;
import vn.fpt.campusstay.common.file.FileStore;
import vn.fpt.campusstay.config.TimeConfig;

/**
 * Late check-ins (spec §6.9, D-20): a student who cannot arrive in the check-in window asks online with a reason,
 * the day and an evidence file, or tells the desk and Staff record it (A-12); a Manager approves a new deadline (at
 * most {@code late_check_in.max_days} after the check-in end) or rejects it with a reason. A student has one late
 * check-in per Term, whoever files it and however it ends. An approved late check-in moves the arrival deadline: the
 * desk checks the student in until then (see {@link DeskService}). The Balance is paid before check-in, so it never
 * waits for the arrival: an unpaid student's Balance deadline moves only when the Manager chooses a later one, at most
 * the arrival day.
 */
@Service
public class LateCheckInService {

    public record Created(String id) {
    }

    public record Evidence(String name, String url) {
    }

    public record DecisionView(String status, LocalDate deadline, String reason) {
    }

    /** @param source {@code Desk} (recorded by Staff) or {@code Online} (asked by the student) */
    public record Item(String id, String studentCode, String name, String allocation, String reason, String receivedBy,
            boolean paid, String payment, Instant balanceDueAt, LocalDate requestedFor, Evidence evidence,
            Instant windowClosedAt, LocalDate suggestedDeadline, DecisionView decision, String source) {
    }

    /** The student's late check-in on My Room. */
    public record MyRequest(String id, String status, LocalDate requestedFor, LocalDate deadline, String reason,
            String decisionReason, Instant createdAt, String source) {
    }

    /**
     * @param canRequest the student may ask now (a Bed not checked in, no late check-in yet this Term, before the
     *                   arrival deadline when the Balance is paid)
     * @param latestDay  the latest day that may be asked for (the check-in end + the longest late check-in)
     */
    public record Mine(MyRequest request, boolean canRequest, LocalDate checkInEnd, LocalDate latestDay) {
    }

    public record OnlineCommand(String reason, String requestedFor, String evidenceName, byte[] evidence) {
    }

    public record Page(List<Item> items) {
    }

    public record CreateCommand(Long termId, String studentCode, String reason, String requestedFor, String evidenceName,
            byte[] evidence) {
    }

    private record Row(long id, long allocationId, long termId, long studentId, long bedId, String reason, Long receivedBy,
            LocalDate requestedFor, Long evidenceFileId, Instant windowClosedAt, LocalDate suggestedDeadline,
            String status, LocalDate deadline, String decisionReason, Instant createdAt, String source) {
    }

    private static final Map<String, String> STATUSES = Map.of("PENDING", "Pending", "APPROVED", "Approved",
            "REJECTED", "Rejected");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final TermCatalog terms;
    private final Inventory inventory;
    private final UserDirectory users;
    private final Billing billing;
    private final FileStore files;
    private final FileLinks links;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Parameters parameters;
    private final Clock clock;

    public LateCheckInService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, TermCatalog terms,
            Inventory inventory, UserDirectory users, Billing billing, FileStore files, FileLinks links,
            ApplicationEventPublisher events, AuditLog audit, Parameters parameters, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.terms = terms;
        this.inventory = inventory;
        this.users = users;
        this.billing = billing;
        this.files = files;
        this.links = links;
        this.events = events;
        this.audit = audit;
        this.parameters = parameters;
        this.clock = clock;
    }

    /** Staff at the desk record the student's request. */
    @Transactional
    public Created create(CreateCommand cmd) {
        AuthenticatedUser user = currentUser.require(Permission.DESK);
        UserDirectory.StudentProfile student = users.studentByCode(cmd.studentCode() == null ? "" : cmd.studentCode().trim())
                .orElseThrow(() -> ApiException.notFound("No Bed is allocated to this student."));
        record Alloc(long id, long termId, long bedId) {
        }
        Alloc alloc = jdbc.sql("""
                SELECT id, term_id, bed_id FROM asg_allocation
                WHERE student_id = :s AND status = 'ACTIVE' AND checked_in_at IS NULL""" + (cmd.termId() != null
                ? " AND term_id = :t" : "") + " ORDER BY allocated_at DESC LIMIT 1")
                .params(cmd.termId() != null ? Map.of("s", student.userId(), "t", cmd.termId())
                        : Map.of("s", student.userId()))
                .query((rs, i) -> new Alloc(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("bed_id"))).optional()
                .orElseThrow(() -> ApiException.notFound("This student has no Bed waiting for check-in."));
        Inventory.BedSlot bed = inventory.beds(List.of(alloc.bedId())).get(alloc.bedId());
        blockScope.check(bed.buildingId());
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        FieldErrors errors = new FieldErrors();
        String reason = cmd.reason() == null ? "" : cmd.reason().trim();
        errors.check(!reason.isEmpty(), "reason", "Write why the student arrives late.");
        errors.check(reason.length() <= 500, "reason", "Keep the reason under 500 characters.");
        LocalDate requestedFor = null;
        try {
            requestedFor = cmd.requestedFor() == null ? null : LocalDate.parse(cmd.requestedFor().trim());
        } catch (DateTimeParseException e) {
            // reported below
        }
        errors.check(requestedFor != null, "requestedFor", "Choose the day the student will arrive.");
        errors.check(requestedFor == null || !requestedFor.isBefore(today), "requestedFor",
                "Choose today or a later day.");
        errors.throwIfAny();
        TermSummary term = terms.findPublished(alloc.termId()).orElseThrow();
        Instant windowClosed = term.checkInEnd() == null ? Instant.now(clock)
                : term.checkInEnd().plusDays(1).atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant();
        if (jdbc.sql("SELECT count(*) FROM asg_late_check_in WHERE allocation_id = :a").param("a", alloc.id())
                .query(Long.class).single() > 0) {
            throw ApiException.conflict("LATE_REQUEST_EXISTS",
                    "This student already has a late check-in for this Term: one request per Term.");
        }
        Long fileId = cmd.evidence() == null || cmd.evidence().length == 0 ? null
                : files.store("asg", cmd.evidenceName(), cmd.evidence(), FileStore.IMAGES_AND_PDF, user.userId()).id();
        try {
            long id = jdbc.sql("""
                    INSERT INTO asg_late_check_in (allocation_id, reason, received_by, requested_for, evidence_file_id,
                                                   window_closed_at, suggested_deadline, created_at)
                    VALUES (:allocation, :reason, :by, :day, :file, :closed, :day, :now) RETURNING id
                    """)
                    .param("allocation", alloc.id()).param("reason", reason).param("by", user.userId())
                    .param("day", requestedFor).param("file", fileId).param("closed", Timestamp.from(windowClosed))
                    .param("now", Timestamp.from(Instant.now(clock))).query(Long.class).single();
            audit.record("LATE_CHECK_IN_REQUESTED", AuditLog.Tone.INFO, "Allocation", alloc.id(),
                    "Room " + bed.roomCode() + " · Bed " + bed.bedLabel(), Map.of("requestedFor", requestedFor.toString()));
            return new Created(String.valueOf(id));
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("LATE_REQUEST_EXISTS", "This student already has a late check-in waiting.");
        }
    }

    // ---------------------------------------------------------------- the student, online

    @Transactional(readOnly = true)
    public Mine mine() {
        long me = currentUser.require(Role.STUDENT).userId();
        Optional<Waiting> waiting = waiting(me, false);
        if (waiting.isEmpty()) {
            return new Mine(null, false, null, null);
        }
        Waiting w = waiting.get();
        MyRequest request = jdbc.sql("""
                SELECT * FROM asg_late_check_in WHERE allocation_id = :a ORDER BY created_at DESC, id DESC LIMIT 1
                """).param("a", w.id())
                .query((rs, i) -> new MyRequest(String.valueOf(rs.getLong("id")), STATUSES.get(rs.getString("status")),
                        rs.getObject("requested_for", LocalDate.class), rs.getObject("deadline", LocalDate.class),
                        rs.getString("reason"), rs.getString("decision_reason"), instant(rs.getTimestamp("created_at")),
                        sourceLabel(rs.getString("source"))))
                .optional().orElse(null);
        return new Mine(request, w.checkedInAt() == null && request == null && open(w), w.term().checkInEnd(),
                latestDay(w.term()));
    }

    /** The student asks online, before the arrival deadline, with an evidence file. */
    @Transactional
    public Created requestOnline(OnlineCommand cmd) {
        AuthenticatedUser user = currentUser.require(Role.STUDENT);
        Waiting w = waiting(user.userId(), true)
                .orElseThrow(() -> ApiException.notFound("You do not hold a Bed waiting for check-in."));
        if (w.checkedInAt() != null) {
            throw ApiException.conflict("ALREADY_CHECKED_IN", "You have already checked in.");
        }
        if (!open(w)) {
            throw ApiException.conflict("LATE_REQUEST_CLOSED",
                    "The check-in period has ended. Ask the dormitory desk about a late check-in.");
        }
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        FieldErrors errors = new FieldErrors();
        String reason = cmd.reason() == null ? "" : cmd.reason().trim();
        errors.check(!reason.isEmpty(), "reason", "Write why you arrive late.");
        errors.check(reason.length() <= 500, "reason", "Keep the reason under 500 characters.");
        LocalDate requestedFor = parseDay(cmd.requestedFor()).orElse(null);
        errors.check(requestedFor != null, "requestedFor", "Choose the day you will arrive.");
        errors.check(requestedFor == null || !requestedFor.isBefore(today), "requestedFor",
                "Choose today or a later day.");
        LocalDate latest = latestDay(w.term());
        errors.check(requestedFor == null || latest == null || !requestedFor.isAfter(latest), "requestedFor",
                "Choose a day up to " + (latest == null ? "" : DAY.format(latest)) + ".");
        errors.check(cmd.evidence() != null && cmd.evidence().length > 0, "evidence",
                "Attach a document that explains the delay (JPEG, PNG or PDF).");
        errors.throwIfAny();
        Inventory.BedSlot bed = inventory.beds(w.termId(), List.of(w.bedId())).get(w.bedId());
        long fileId = files.store("asg", cmd.evidenceName(), cmd.evidence(), FileStore.IMAGES_AND_PDF, user.userId()).id();
        Instant windowClosed = w.term().checkInEnd() == null ? Instant.now(clock)
                : w.term().checkInEnd().plusDays(1).atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant();
        if (jdbc.sql("SELECT count(*) FROM asg_late_check_in WHERE allocation_id = :a")
                .param("a", w.id()).query(Long.class).single() > 0) {
            throw ApiException.conflict("LATE_REQUEST_EXISTS",
                    "You already asked for a late check-in this Term: one request per Term.");
        }
        long id = jdbc.sql("""
                INSERT INTO asg_late_check_in (allocation_id, reason, requested_for, evidence_file_id, window_closed_at,
                                               suggested_deadline, source, created_at)
                VALUES (:allocation, :reason, :day, :file, :closed, :day, 'ONLINE', :now) RETURNING id
                """)
                .param("allocation", w.id()).param("reason", reason).param("day", requestedFor).param("file", fileId)
                .param("closed", Timestamp.from(windowClosed)).param("now", Timestamp.from(Instant.now(clock)))
                .query(Long.class).single();
        UserDirectory.StudentProfile me = users.studentProfile(user.userId()).orElseThrow();
        events.publishEvent(new LateCheckInRequested(id, user.userId(), me.name(), me.studentCode(),
                bed == null ? null : bed.roomCode(), requestedFor));
        return new Created(String.valueOf(id));
    }

    private record Waiting(long id, long termId, long bedId, Instant checkedInAt, TermSummary term) {
    }

    /** The student's active Allocation that is not lived in yet, the latest Term first. */
    private Optional<Waiting> waiting(long studentId, boolean lock) {
        return jdbc.sql("""
                SELECT id, term_id, bed_id, checked_in_at FROM asg_allocation
                WHERE student_id = :s AND status = 'ACTIVE' AND resident_at IS NULL
                ORDER BY allocated_at DESC LIMIT 1""" + (lock ? " FOR UPDATE" : ""))
                .param("s", studentId)
                .query((rs, i) -> new Object[] { rs.getLong("id"), rs.getLong("term_id"), rs.getLong("bed_id"),
                        instant(rs.getTimestamp("checked_in_at")) })
                .optional()
                .flatMap(r -> terms.findPublished((Long) r[1]).map(t -> new Waiting((Long) r[0], (Long) r[1],
                        (Long) r[2], (Instant) r[3], t)));
    }

    /** A paid student asks before the check-in end; an unpaid one before the Balance deadline (else forfeited). */
    private boolean open(Waiting w) {
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        boolean paid = billing.checkInDue(w.id()).isEmpty();
        return !paid || w.term().checkInEnd() == null || !today.isAfter(w.term().checkInEnd());
    }

    private LocalDate latestDay(TermSummary term) {
        return term.checkInEnd() == null ? null
                : term.checkInEnd().plusDays(Math.max(0, parameters.intValue("late_check_in.max_days")));
    }

    private static String sourceLabel(String source) {
        return "ONLINE".equals(source) ? "Online" : "Desk";
    }

    // ---------------------------------------------------------------- Managers

    /** The Block Manager's list: pending requests first, then the decided ones. */
    @Transactional(readOnly = true)
    public Page list(Long termId, String block) {
        Set<Long> scope = blockScope.resolve(block).ids();
        TermSummary term = term(termId);
        List<Row> rows = jdbc.sql("""
                SELECT l.*, a.term_id, a.student_id, a.bed_id FROM asg_late_check_in l
                JOIN asg_allocation a ON a.id = l.allocation_id
                WHERE a.term_id = :term
                ORDER BY (l.status = 'PENDING') DESC, l.created_at DESC
                """).param("term", term.id())
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getLong("allocation_id"), rs.getLong("term_id"),
                        rs.getLong("student_id"), rs.getLong("bed_id"), rs.getString("reason"),
                        rs.getObject("received_by", Long.class), rs.getObject("requested_for", LocalDate.class),
                        rs.getObject("evidence_file_id", Long.class), instant(rs.getTimestamp("window_closed_at")),
                        rs.getObject("suggested_deadline", LocalDate.class), rs.getString("status"),
                        rs.getObject("deadline", LocalDate.class), rs.getString("decision_reason"),
                        instant(rs.getTimestamp("created_at")), rs.getString("source")))
                .list();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(rows.stream().map(Row::bedId).toList());
        List<Row> visible = rows.stream().filter(r -> beds.get(r.bedId()) != null
                && scope.contains(beds.get(r.bedId()).buildingId())).toList();
        Map<Long, UserDirectory.Student> students = users.students(visible.stream().map(Row::studentId).toList());
        Map<Long, String> staff = users.displayNames(visible.stream().map(Row::receivedBy).filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        Map<Long, Billing.CheckInDue> dues = billing.checkInDues(visible.stream().map(Row::allocationId).toList());
        NumberFormat vnd = NumberFormat.getIntegerInstance(Locale.US);
        List<Item> items = new ArrayList<>();
        for (Row r : visible) {
            UserDirectory.Student s = students.get(r.studentId());
            Inventory.BedSlot bed = beds.get(r.bedId());
            Billing.CheckInDue due = dues.get(r.allocationId());
            Evidence evidence = r.evidenceFileId() == null ? null : files.info(r.evidenceFileId())
                    .map(f -> new Evidence(f.name(), links.link(f.id()))).orElse(null);
            items.add(new Item(String.valueOf(r.id()), s == null ? null : s.studentCode(), s == null ? null : s.name(),
                    "Room " + bed.roomCode() + " · Bed " + bed.bedLabel(), r.reason(), staff.get(r.receivedBy()),
                    due == null, due == null ? "Paid" : vnd.format(due.balance() + due.utilityDeposit()) + " VND unpaid",
                    due == null ? null : due.dueAt(), r.requestedFor(), evidence, r.windowClosedAt(), r.suggestedDeadline(),
                    r.status().equals("PENDING") ? null
                            : new DecisionView(STATUSES.get(r.status()), r.deadline(), r.decisionReason()),
                    sourceLabel(r.source())));
        }
        items.sort(Comparator.comparing((Item i) -> i.decision() != null));
        return new Page(items);
    }

    /**
     * Approve with the arrival deadline ({@code YYYY-MM-DD}, today or later, at most {@code late_check_in.max_days}
     * after the check-in end) and, for an unpaid student, optionally a later Balance deadline ({@code balanceDue}:
     * today or later and at most the arrival day, as the Balance is paid before check-in); or reject with a reason.
     */
    @Transactional
    public void decide(String id, String decision, String deadline, String balanceDue, String reason) {
        AuthenticatedUser user = currentUser.require(Permission.DECIDE_REFUNDS);
        record Target(long id, long allocationId, long termId, long studentId, long bedId, String status,
                String allocationStatus) {
        }
        Target t = parse(id).flatMap(n -> jdbc.sql("""
                SELECT l.id, l.status, l.allocation_id, a.term_id, a.student_id, a.bed_id, a.status AS allocation_status
                FROM asg_late_check_in l
                JOIN asg_allocation a ON a.id = l.allocation_id WHERE l.id = :id FOR UPDATE OF l, a
                """).param("id", n)
                .query((rs, i) -> new Target(rs.getLong("id"), rs.getLong("allocation_id"), rs.getLong("term_id"),
                        rs.getLong("student_id"), rs.getLong("bed_id"), rs.getString("status"),
                        rs.getString("allocation_status"))).optional())
                .orElseThrow(() -> ApiException.notFound("This late check-in does not exist."));
        Inventory.BedSlot bed = inventory.beds(List.of(t.bedId())).get(t.bedId());
        blockScope.check(bed.buildingId());
        if (!t.status().equals("PENDING")) {
            throw ApiException.conflict("ALREADY_DECIDED", "This late check-in was already decided.");
        }
        Instant now = Instant.now(clock);
        String d = decision == null ? "" : decision.trim();
        String sentence;
        if (d.equalsIgnoreCase("approved")) {
            LocalDate day = parseDay(deadline).orElseThrow(() -> FieldErrors.single("deadline",
                    "Choose the last day the student may check in."));
            if (day.isBefore(LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE)))) {
                throw FieldErrors.single("deadline", "Choose today or a later day.");
            }
            LocalDate latest = terms.findPublished(t.termId()).map(this::latestDay).orElse(null);
            if (latest != null && day.isAfter(latest)) {
                throw FieldErrors.single("deadline", "Choose a day up to " + DAY.format(latest) + ".");
            }
            if (!t.allocationStatus().equals("ACTIVE")) {
                throw ApiException.conflict("ALLOCATION_ENDED", "This student no longer holds the Bed.");
            }
            LocalDate balanceDay = parseDay(balanceDue).orElse(null);
            if (balanceDue != null && !balanceDue.isBlank() && balanceDay == null) {
                throw FieldErrors.single("balanceDue", "Choose a valid day.");
            }
            if (balanceDay != null && billing.checkInDue(t.allocationId()).isPresent()) {
                if (balanceDay.isBefore(LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE)))) {
                    throw FieldErrors.single("balanceDue", "Choose today or a later day.");
                }
                if (balanceDay.isAfter(day)) {
                    throw FieldErrors.single("balanceDue", "The Balance is paid before check-in: choose a day up to "
                            + DAY.format(day) + ".");
                }
                billing.extendBalanceDeadline(t.allocationId(), ForfeitService.endOf(balanceDay));
            }
            jdbc.sql("""
                    UPDATE asg_late_check_in SET status = 'APPROVED', deadline = :day, decided_by = :by, decided_at = :now
                    WHERE id = :id
                    """).param("day", day).param("by", user.userId()).param("now", Timestamp.from(now))
                    .param("id", t.id()).update();
            sentence = "approved until " + DAY.format(day);
        } else if (d.equalsIgnoreCase("rejected")) {
            if (reason == null || reason.isBlank()) {
                throw FieldErrors.single("reason", "Write why the late check-in is rejected.");
            }
            jdbc.sql("""
                    UPDATE asg_late_check_in SET status = 'REJECTED', decision_reason = :reason, decided_by = :by,
                           decided_at = :now
                    WHERE id = :id
                    """).param("reason", reason.trim()).param("by", user.userId()).param("now", Timestamp.from(now))
                    .param("id", t.id()).update();
            sentence = "rejected";
        } else {
            throw FieldErrors.single("decision", "Choose Approved or Rejected.");
        }
        audit.record("LATE_CHECK_IN_DECIDED", AuditLog.Tone.INFO, "Late check-in", t.id(),
                "Room " + bed.roomCode() + " · Bed " + bed.bedLabel(), Map.of("decision", sentence));
        events.publishEvent(new LateCheckInDecided(t.id(), t.studentId(), sentence));
    }

    private TermSummary term(Long termId) {
        if (termId != null) {
            return terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        }
        return terms.publishedTerms().stream().filter(TermSummary::current).findFirst()
                .or(terms::openForRegistration)
                .orElseThrow(() -> ApiException.notFound("No Term is published yet."));
    }

    private static Optional<LocalDate> parseDay(String value) {
        try {
            return value == null || value.isBlank() ? Optional.empty() : Optional.of(LocalDate.parse(value.trim()));
        } catch (DateTimeParseException e) {
            return Optional.empty();
        }
    }

    private static Optional<Long> parse(String value) {
        if (value == null || value.isBlank() || value.length() > 18 || !value.trim().chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(value.trim()));
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
