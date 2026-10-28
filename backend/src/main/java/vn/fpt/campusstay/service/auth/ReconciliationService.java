package vn.fpt.campusstay.service.auth;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.file.XlsxFile;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.event.StudentNotEnrolled;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.service.assignment.Stays;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * Enrollment reconciliation (D-28, spec §6.12). For a Term, a Manager uploads the enrolled list (recommended) or a
 * list of leavers (CSV or XLSX, read like the student list) and compares it with the residents, continuing residents
 * and applicants of that Term:
 * <ol>
 * <li>someone of the Term who is not enrolled (or is on the leavers list): resolved with a note; "Not enrolled"
 * cancels the next-Term Allocation, rejects the Application or terminates the stay of a resident (reason Not
 * enrolled), through {@link StudentNotEnrolled};</li>
 * <li>someone of the Term missing from the enrolled list: the Manager checks and records the outcome the same way;</li>
 * <li>a student code of the file that does not exist: for information;</li>
 * <li>an enrollment status that changed: the directory is updated (for information).</li>
 * </ol>
 * The next-Term fees wait until no item of groups 1–2 is open; a second reconciliation at the start of the Term
 * catches late changes. Fictional (demo) accounts are compared too, so the demo shows every group.
 */
@Service
public class ReconciliationService {

    public record TermRef(String id, String name) {
    }

    public record Counts(long notEnrolled, long notFound, long unknownCodes, long changed, long open) {
    }

    /** @param kind {@code Enrolled list} or {@code Leavers list} */
    public record Run(String id, String kind, String fileName, int rowsRead, String by, Instant createdAt,
            Counts counts) {
    }

    /** @param resolved files reconciled for the Term and whether none of their items is open */
    public record Overview(TermRef term, List<TermRef> terms, List<Run> runs, long openItems, boolean resolved,
            int people) {
    }

    /**
     * @param group   1–4
     * @param roles   {@code Resident}, {@code Continuing resident}, {@code Applicant}
     * @param status  {@code Open}, {@code Resolved} or {@code Info}
     * @param outcome {@code Not enrolled} or {@code Enrolled} once resolved
     */
    public record Item(String id, int group, String studentCode, String studentName, List<String> roles,
            String fileStatus, String directoryStatus, Integer line, String status, String outcome, String note,
            String resolvedBy, Instant resolvedAt) {
    }

    public record Detail(Run run, TermRef term, List<Item> items) {
    }

    public record Template(String fileName, byte[] bytes) {
    }

    private record Person(long userId, String code, String name, String enrollment, boolean demo) {
    }

    private record Row(long id, int grp, Long studentId, String code, String name, String roles, String fileStatus,
            String directoryStatus, Integer line, String status, String outcome, String note, Long resolvedBy,
            Instant resolvedAt) {
    }

    private static final Map<String, String> KINDS = Map.of("ENROLLED", "Enrolled list", "LEAVERS", "Leavers list");
    private static final Map<String, String> ROLES = Map.of("RESIDENT", "Resident", "CONTINUING", "Continuing resident",
            "APPLICANT", "Applicant");
    private static final Map<String, String> ITEM_STATUSES = Map.of("OPEN", "Open", "RESOLVED", "Resolved", "INFO",
            "Info");
    private static final Map<String, String> OUTCOMES = Map.of("NOT_ENROLLED", "Not enrolled", "ENROLLED", "Enrolled");
    /** Vietnamese words schools use for a student's status (accents and spaces removed, as {@link StudentListFile#key}). */
    private static final Map<String, String> VIETNAMESE = Map.of("danghoc", "ENROLLED", "hoclai", "ENROLLED",
            "baoluu", "SUSPENDED", "tamdung", "SUSPENDED", "totnghiep", "GRADUATED", "datotnghiep", "GRADUATED",
            "thoihoc", "WITHDRAWN", "nghihoc", "WITHDRAWN", "buocthoihoc", "WITHDRAWN");

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final TermCatalog terms;
    private final Residences residences;
    private final Stays stays;
    private final Applications applications;
    private final UserDirectory users;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public ReconciliationService(JdbcClient jdbc, CurrentUser currentUser, TermCatalog terms, Residences residences,
            Stays stays, Applications applications, UserDirectory users, ApplicationEventPublisher events,
            AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.terms = terms;
        this.residences = residences;
        this.stays = stays;
        this.applications = applications;
        this.users = users;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    /** @param termId null = the next Term whose requests window is open, else the current Term */
    @Transactional(readOnly = true)
    public Overview overview(Long termId) {
        currentUser.require(Role.MANAGER, Role.ADMIN);
        TermSummary term = term(termId);
        List<Run> runs = jdbc.sql("SELECT * FROM auth_reconciliation WHERE term_id = :t ORDER BY created_at DESC, id DESC")
                .param("t", term.id()).query((rs, i) -> runRow(rs)).list().stream().map(this::run).toList();
        long open = runs.stream().mapToLong(r -> r.counts().open()).sum();
        return new Overview(new TermRef(String.valueOf(term.id()), term.name()),
                terms.publishedTerms().stream().map(t -> new TermRef(String.valueOf(t.id()), t.name())).toList(), runs,
                open, !runs.isEmpty() && open == 0, people(term.id()).size());
    }

    /**
     * XLSX template (Excel set to Vietnamese opens a comma CSV as one column): the student code, the name (optional)
     * and the enrollment status or the reason of leaving.
     */
    public Template template(String kind) {
        currentUser.require(Permission.RECONCILE_ENROLLMENT);
        boolean leavers = "leavers".equalsIgnoreCase(kind == null ? "" : kind.trim());
        List<List<String>> rows = leavers
                ? List.of(List.of("student_code", "full_name", "reason"), List.of("SE190001", "Nguyen Van A", "Graduated"))
                : List.of(List.of("student_code", "full_name", "enrollment_status"), List.of("SE190001", "Nguyen Van A", "Enrolled"));
        return new Template(leavers ? "leavers-template.xlsx" : "enrolled-list-template.xlsx",
                XlsxFile.of(leavers ? "Leavers" : "Enrolled", rows));
    }

    /** Reads the file and records every difference with the people of the Term (one Audit Log entry). */
    @Transactional
    public Detail upload(Long termId, String kind, String fileName, byte[] bytes) {
        AuthenticatedUser user = currentUser.require(Permission.RECONCILE_ENROLLMENT);
        if (termId == null) {
            throw FieldErrors.single("termId", "Choose the Term the list is for.");
        }
        TermSummary term = terms.findPublished(termId).orElseThrow(() -> FieldErrors.single("termId",
                "Choose a published Term."));
        String k = kind == null ? "" : kind.trim().toUpperCase(Locale.ROOT);
        if (!KINDS.containsKey(k)) {
            throw FieldErrors.single("kind", "Choose the enrolled list or a leavers list.");
        }
        if (bytes == null || bytes.length == 0) {
            throw FieldErrors.single("file", "Choose a CSV or XLSX file.");
        }
        StudentListFile.Table table = StudentListFile.read(fileName, bytes, List.of("studentCode"));
        Map<String, Person> directory = directory();
        Map<Long, Set<String>> people = people(term.id());
        Instant now = Instant.now(clock);
        long runId = jdbc.sql("""
                INSERT INTO auth_reconciliation (term_id, kind, file_name, rows_read, created_by, created_at)
                VALUES (:t, :kind, :file, :rows, :by, :now) RETURNING id
                """).param("t", term.id()).param("kind", k)
                .param("file", fileName == null || fileName.isBlank() ? "list" : fileName.strip())
                .param("rows", table.lines().size()).param("by", user.userId()).param("now", Timestamp.from(now))
                .query(Long.class).single();
        Set<Long> listed = new HashSet<>();
        Set<String> seen = new HashSet<>();
        for (StudentListFile.Line line : table.lines()) {
            String code = line.values().getOrDefault("studentCode", "").strip().toUpperCase(Locale.ROOT);
            if (code.isEmpty() || !seen.add(code)) {
                continue;
            }
            String raw = line.values().get("enrollment");
            String fileStatus = k.equals("LEAVERS") ? leaving(raw) : status(raw);
            Person p = directory.get(code);
            if (p == null) {
                item(runId, 3, null, code, line.values().get("name"), null, fileStatus, null, line.number(), "INFO");
                continue;
            }
            listed.add(p.userId());
            if (!fileStatus.equals(p.enrollment())) {
                jdbc.sql("UPDATE auth_student SET enrollment_status = :status, synced_at = :now WHERE user_id = :u")
                        .param("status", fileStatus).param("now", Timestamp.from(now)).param("u", p.userId()).update();
                item(runId, 4, p.userId(), code, p.name(), roles(people.get(p.userId())), fileStatus, p.enrollment(),
                        line.number(), "INFO");
            }
            if (people.containsKey(p.userId()) && !fileStatus.equals("ENROLLED")) {
                item(runId, 1, p.userId(), code, p.name(), roles(people.get(p.userId())), fileStatus, p.enrollment(),
                        line.number(), "OPEN");
            }
        }
        if (k.equals("ENROLLED")) {
            Map<Long, Person> byId = directory.values().stream()
                    .collect(Collectors.toMap(Person::userId, p -> p, (a, b) -> a));
            people.forEach((studentId, roles) -> {
                if (listed.contains(studentId)) {
                    return;
                }
                Person p = byId.get(studentId);
                item(runId, 2, studentId, p == null ? "?" : p.code(), p == null ? null : p.name(), roles(roles), null,
                        p == null ? null : p.enrollment(), null, "OPEN");
            });
        }
        Run run = run(jdbc.sql("SELECT * FROM auth_reconciliation WHERE id = :id").param("id", runId)
                .query((rs, i) -> runRow(rs)).single());
        Map<String, Object> change = new LinkedHashMap<>();
        change.put("term", term.name());
        change.put("kind", KINDS.get(k));
        change.put("rows", table.lines().size());
        change.put("notEnrolled", run.counts().notEnrolled());
        change.put("notFound", run.counts().notFound());
        change.put("unknownCodes", run.counts().unknownCodes());
        change.put("changed", run.counts().changed());
        audit.record("ENROLLMENT_RECONCILED", AuditLog.Tone.INFO, "Reconciliation", runId, run.fileName(), change);
        return detail(String.valueOf(runId));
    }

    /** @param group 1–4 or null; the items of a file, open first */
    @Transactional(readOnly = true)
    public Detail detail(String id) {
        currentUser.require(Role.MANAGER, Role.ADMIN);
        long runId = parse(id).orElseThrow(ReconciliationService::notFound);
        RunRow r = jdbc.sql("SELECT * FROM auth_reconciliation WHERE id = :id").param("id", runId)
                .query((rs, i) -> runRow(rs)).optional().orElseThrow(ReconciliationService::notFound);
        List<Row> rows = jdbc.sql("""
                SELECT * FROM auth_reconciliation_item WHERE reconciliation_id = :id
                ORDER BY (status = 'OPEN') DESC, grp, student_code
                """).param("id", runId).query(ReconciliationService::row).list();
        Map<Long, String> resolvers = users.displayNames(rows.stream().map(Row::resolvedBy)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet()));
        TermSummary term = terms.findPublished(r.termId()).orElse(null);
        return new Detail(run(r), term == null ? null : new TermRef(String.valueOf(term.id()), term.name()),
                rows.stream().map(x -> item(x, resolvers)).toList());
    }

    /**
     * Resolves an item of groups 1–2 with a note (audited). {@code Not enrolled} marks the directory and ends what the
     * student holds in the Term; {@code Enrolled} keeps everything (the Manager checked the student still studies).
     */
    @Transactional
    public Item resolve(String id, String itemId, String outcome, String note) {
        AuthenticatedUser user = currentUser.require(Permission.RECONCILE_ENROLLMENT);
        long runId = parse(id).orElseThrow(ReconciliationService::notFound);
        long rowId = parse(itemId).orElseThrow(ReconciliationService::notFound);
        Row row = jdbc.sql("""
                SELECT * FROM auth_reconciliation_item WHERE id = :id AND reconciliation_id = :run FOR UPDATE
                """).param("id", rowId).param("run", runId).query(ReconciliationService::row).optional()
                .orElseThrow(ReconciliationService::notFound);
        String o = OUTCOMES.entrySet().stream().filter(e -> e.getValue().equalsIgnoreCase(outcome == null ? ""
                : outcome.trim()) || e.getKey().equalsIgnoreCase(outcome == null ? "" : outcome.trim()))
                .map(Map.Entry::getKey).findFirst().orElse(null);
        String text = note == null || note.isBlank() ? null : note.trim();
        FieldErrors errors = new FieldErrors();
        errors.check(o != null, "outcome", "Choose Not enrolled or Enrolled.");
        errors.check(text != null && text.length() <= 500, "note", "Write a note (up to 500 characters): it is audited.");
        errors.throwIfAny();
        if (!row.status().equals("OPEN")) {
            throw ApiException.conflict("ALREADY_RESOLVED", "This item is already resolved.");
        }
        Instant now = Instant.now(clock);
        jdbc.sql("""
                UPDATE auth_reconciliation_item SET status = 'RESOLVED', outcome = :outcome, note = :note,
                       resolved_by = :by, resolved_at = :now
                WHERE id = :id
                """).param("outcome", o).param("note", text).param("by", user.userId())
                .param("now", Timestamp.from(now)).param("id", row.id()).update();
        long termId = jdbc.sql("SELECT term_id FROM auth_reconciliation WHERE id = :id").param("id", runId)
                .query(Long.class).single();
        if (o.equals("NOT_ENROLLED") && row.studentId() != null) {
            jdbc.sql("""
                    UPDATE auth_student SET enrollment_status = 'NOT_ENROLLED', synced_at = :now
                    WHERE user_id = :u AND enrollment_status = 'ENROLLED'
                    """).param("now", Timestamp.from(now)).param("u", row.studentId()).update();
            events.publishEvent(new StudentNotEnrolled(row.studentId(), termId, text));
        }
        audit.record("RECONCILIATION_ITEM_RESOLVED", o.equals("NOT_ENROLLED") ? AuditLog.Tone.WARNING
                : AuditLog.Tone.INFO, "Reconciliation", runId, row.code(),
                Map.of("group", row.grp(), "outcome", OUTCOMES.get(o), "note", text));
        Row saved = jdbc.sql("SELECT * FROM auth_reconciliation_item WHERE id = :id").param("id", row.id())
                .query(ReconciliationService::row).single();
        return item(saved, users.displayNames(List.of(user.userId())));
    }

    // ---------------------------------------------------------------- helpers

    /**
     * Everyone the Term concerns, with how: residents (living in a Room of the Term), continuing residents (a Bed
     * kept for the Term) and applicants (a live Application, a Bed given but not lived in yet included).
     */
    private Map<Long, Set<String>> people(long termId) {
        Map<Long, Set<String>> result = new LinkedHashMap<>();
        Set<Long> continuing = stays.continuingStudents(termId);
        for (Residences.TermResident r : residences.ofTerm(termId)) {
            String role = r.resident() ? "RESIDENT" : continuing.contains(r.studentId()) ? "CONTINUING" : "APPLICANT";
            result.computeIfAbsent(r.studentId(), k -> new LinkedHashSet<>()).add(role);
        }
        applications.applicants(termId).keySet()
                .forEach(s -> result.computeIfAbsent(s, k -> new LinkedHashSet<>()).add("APPLICANT"));
        return result;
    }

    private Map<String, Person> directory() {
        Map<String, Person> result = new HashMap<>();
        jdbc.sql("""
                SELECT u.id, s.student_code, u.display_name, s.enrollment_status, u.demo
                FROM auth_student s JOIN auth_user u ON u.id = s.user_id
                """).query((rs, i) -> new Person(rs.getLong("id"), rs.getString("student_code"),
                        rs.getString("display_name"), rs.getString("enrollment_status"), rs.getBoolean("demo")))
                .list().forEach(p -> result.put(p.code().toUpperCase(Locale.ROOT), p));
        return result;
    }

    /** The enrolled list's status of a line; a blank status means enrolled. */
    private static String status(String value) {
        if (value == null || value.isBlank()) {
            return "ENROLLED";
        }
        return StudentFields.enrollment(value).or(() -> Optional.ofNullable(VIETNAMESE.get(StudentListFile.key(value))))
                .orElseThrow(() -> FieldErrors.single("file", "Unknown enrollment status \"" + value.strip()
                        + "\". Use Enrolled, Suspended, Graduated, Withdrawn or Not enrolled."));
    }

    /** A leavers list line: graduated or withdrawn (any other reason means the student is not enrolled any more). */
    private static String leaving(String value) {
        String s = value == null || value.isBlank() ? "NOT_ENROLLED"
                : StudentFields.enrollment(value).or(() -> Optional.ofNullable(VIETNAMESE.get(StudentListFile.key(value))))
                        .orElse("NOT_ENROLLED");
        return s.equals("ENROLLED") ? "NOT_ENROLLED" : s;
    }

    private void item(long runId, int group, Long studentId, String code, String name, String roles, String fileStatus,
            String directoryStatus, Integer line, String status) {
        jdbc.sql("""
                INSERT INTO auth_reconciliation_item (reconciliation_id, grp, student_id, student_code, student_name,
                                                      roles, file_status, directory_status, line_no, status)
                VALUES (:run, :grp, :student, :code, :name, :roles, :file, :directory, :line, :status)
                """).param("run", runId).param("grp", group).param("student", studentId)
                .param("code", code.length() > 20 ? code.substring(0, 20) : code)
                .param("name", name == null || name.isBlank() ? null : name.strip().length() > 150
                        ? name.strip().substring(0, 150) : name.strip())
                .param("roles", roles).param("file", fileStatus).param("directory", directoryStatus).param("line", line)
                .param("status", status).update();
    }

    private static String roles(Set<String> roles) {
        return roles == null || roles.isEmpty() ? null : String.join(",", roles);
    }

    private record RunRow(long id, long termId, String kind, String fileName, int rowsRead, long createdBy,
            Instant createdAt) {
    }

    private static RunRow runRow(ResultSet rs) throws SQLException {
        return new RunRow(rs.getLong("id"), rs.getLong("term_id"), rs.getString("kind"), rs.getString("file_name"),
                rs.getInt("rows_read"), rs.getLong("created_by"), rs.getTimestamp("created_at").toInstant());
    }

    private Run run(RunRow r) {
        record Count(int grp, String status, long n) {
        }
        List<Count> counts = jdbc.sql("""
                SELECT grp, status, count(*) AS n FROM auth_reconciliation_item WHERE reconciliation_id = :id
                GROUP BY grp, status
                """).param("id", r.id()).query((rs, i) -> new Count(rs.getInt("grp"), rs.getString("status"),
                        rs.getLong("n"))).list();
        java.util.function.IntToLongFunction group = g -> counts.stream().filter(c -> c.grp() == g)
                .mapToLong(Count::n).sum();
        return new Run(String.valueOf(r.id()), KINDS.get(r.kind()), r.fileName(), r.rowsRead(),
                users.displayNames(List.of(r.createdBy())).get(r.createdBy()), r.createdAt(),
                new Counts(group.applyAsLong(1), group.applyAsLong(2), group.applyAsLong(3), group.applyAsLong(4),
                        counts.stream().filter(c -> c.status().equals("OPEN")).mapToLong(Count::n).sum()));
    }

    private static Item item(Row r, Map<Long, String> resolvers) {
        List<String> roles = r.roles() == null ? List.of()
                : java.util.Arrays.stream(r.roles().split(",")).map(ROLES::get).toList();
        return new Item(String.valueOf(r.id()), r.grp(), r.code(), r.name(), roles, label(r.fileStatus()),
                label(r.directoryStatus()), r.line(), ITEM_STATUSES.get(r.status()),
                r.outcome() == null ? null : OUTCOMES.get(r.outcome()), r.note(),
                r.resolvedBy() == null ? null : resolvers.get(r.resolvedBy()), r.resolvedAt());
    }

    private static String label(String enrollment) {
        return enrollment == null ? null : StudentFields.ENROLLMENT.getOrDefault(enrollment, enrollment);
    }

    /** The Term asked for, else the next Term whose requests window opened, else the current one. */
    private TermSummary term(Long termId) {
        if (termId != null) {
            return terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        }
        return stays.openWindows().stream().findFirst().flatMap(w -> terms.findPublished(w.termId()))
                .or(() -> terms.publishedTerms().stream().filter(TermSummary::current).findFirst())
                .orElseThrow(() -> ApiException.notFound("No Term is published yet."));
    }

    private static Optional<Long> parse(String value) {
        if (value == null || value.isBlank() || value.length() > 18 || !value.trim().chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(value.trim()));
    }

    private static ApiException notFound() {
        return ApiException.notFound("This reconciliation does not exist.");
    }

    private static Row row(ResultSet rs, int i) throws SQLException {
        Timestamp resolved = rs.getTimestamp("resolved_at");
        return new Row(rs.getLong("id"), rs.getInt("grp"), rs.getObject("student_id", Long.class),
                rs.getString("student_code"), rs.getString("student_name"), rs.getString("roles"),
                rs.getString("file_status"), rs.getString("directory_status"), rs.getObject("line_no", Integer.class),
                rs.getString("status"), rs.getString("outcome"), rs.getString("note"),
                rs.getObject("resolved_by", Long.class), resolved == null ? null : resolved.toInstant());
    }
}
