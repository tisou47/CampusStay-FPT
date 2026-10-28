package vn.fpt.campusstay.service.auth;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import vn.fpt.campusstay.common.file.XlsxFile;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.AuthProperties;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.event.StudentVerified;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;

/**
 * Manager › Import student list (D-07, spec §6.2): upload a CSV or XLSX file, read the preview line by line
 * (New, Update, Unchanged, Error with the reason), confirm, read the result. Lines are matched on the student code;
 * a column the file does not have is left as it is. Students missing from the file are left unchanged unless the
 * Manager asks to mark them Not enrolled. Fictional accounts of the base data are never matched or marked: a real
 * student takes their code (spec O-3). Every import is written to the Audit Log, without personal data.
 */
@Service
public class StudentImportService {

    /** A line of the preview. {@code outcome} New, Update, Unchanged or Error; {@code changes} field names. */
    public record Row(int line, String studentCode, String name, String email, String outcome, String message,
            List<String> changes) {
    }

    public record Counts(long created, long updated, long unchanged, long errors) {
    }

    public record Result(long created, long updated, long unchanged, long errors, long verified, long markedNotEnrolled) {
    }

    public record RowPage(List<Row> items, long total) {
    }

    /**
     * An import: {@code status} Preview or Applied; {@code missing} the real students the file does not list who
     * are not yet Not enrolled (what "mark as not enrolled" would change); {@code result} once applied.
     */
    public record Import(String id, String fileName, String status, Instant uploadedAt, String uploadedBy,
            List<String> fields, Counts counts, long missing, RowPage rows, Result result) {
    }

    public record HistoryItem(String id, String fileName, String status, Instant uploadedAt, String uploadedBy,
            Instant appliedAt, Result result) {
    }

    public record History(List<HistoryItem> items, long total) {
    }

    /** The CSV template: its name and UTF-8 bytes (with a byte-order mark, so spreadsheets read the accents). */
    public record Template(String fileName, byte[] bytes) {
    }

    private enum Outcome { NEW, UPDATE, UNCHANGED, ERROR }

    /** What a line means against the accounts as they are now. */
    private record Evaluation(Outcome outcome, String message, Long userId, Values values, List<String> changes,
            boolean verifies, boolean keepEmail) {

        static Evaluation error(String message) {
            return new Evaluation(Outcome.ERROR, message, null, null, List.of(), false, false);
        }
    }

    /** A line's values after reading; null = the file has no such column (kept as it is). */
    private record Values(String code, String name, String email, String gender, LocalDate dateOfBirth,
            boolean hasDateOfBirth, String major, String cohort, Integer semester, boolean hasSemester, String hometown,
            boolean hasHometown, String region, boolean hasRegion, String enrollment, List<String> priorityGroups) {
    }

    private record Account(long id, String email, String name, boolean used, String gender, LocalDate dateOfBirth,
            String major, String cohort, Integer semester, String hometown, String region, String enrollment,
            List<String> priorityGroups, String verification, String source, String status) {
    }

    private static final TypeReference<Map<String, String>> VALUES = new TypeReference<>() {
    };

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final StudentFields fields;
    private final StudentCodes codes;
    private final AuthProperties properties;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final JsonMapper json;
    private final Clock clock;

    StudentImportService(JdbcClient jdbc, CurrentUser currentUser, StudentFields fields, StudentCodes codes,
            AuthProperties properties, ApplicationEventPublisher events, AuditLog audit, JsonMapper json, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.fields = fields;
        this.codes = codes;
        this.properties = properties;
        this.events = events;
        this.audit = audit;
        this.json = json;
        this.clock = clock;
    }

    /** The template is XLSX, not CSV: Excel set to Vietnamese opens a comma CSV as one column. */
    public Template template() {
        currentUser.require(Permission.MANAGE_STUDENTS);
        return new Template("student-list-template.xlsx", XlsxFile.of("Students", List.of(
                List.copyOf(StudentListFile.HEADERS.values()),
                List.of("SE190421", "Nguyen Van An", "annvse190421@fpt.edu.vn", "Male", "2005-03-14", "SE", "K19", "4",
                        "Da Nang", "CENTRAL", "Enrolled", "FAR_FROM_CAMPUS"))));
    }

    /** Reads the file and stores its preview; nothing changes in the directory yet. */
    @Transactional
    public Import upload(String fileName, byte[] bytes) {
        AuthenticatedUser me = currentUser.require(Permission.MANAGE_STUDENTS);
        if (bytes == null || bytes.length == 0) {
            throw FieldErrors.single("file", "Choose a CSV or XLSX file.");
        }
        String name = fileName == null || fileName.isBlank() ? "students" : fileName.strip();
        StudentListFile.Table table = StudentListFile.read(name, bytes);
        long id = jdbc.sql("""
                INSERT INTO auth_student_import (file_name, uploaded_by, uploaded_at, fields)
                VALUES (:name, :by, :now, :fields) RETURNING id
                """)
                .param("name", name.length() > 255 ? name.substring(0, 255) : name).param("by", me.userId())
                .param("now", Timestamp.from(Instant.now(clock))).param("fields", table.fields().toArray(String[]::new))
                .query(Long.class).single();
        List<Evaluation> evaluations = evaluate(table.lines(), table.fields());
        for (int i = 0; i < table.lines().size(); i++) {
            StudentListFile.Line line = table.lines().get(i);
            Evaluation e = evaluations.get(i);
            String code = line.values().getOrDefault("studentCode", "");
            jdbc.sql("""
                    INSERT INTO auth_student_import_row (import_id, line_no, student_code, data, outcome, message, user_id)
                    VALUES (:id, :line, :code, CAST(:data AS jsonb), :outcome, :message, :user)
                    """)
                    .param("id", id).param("line", line.number())
                    .param("code", code.isEmpty() ? null : code.length() > 20 ? code.substring(0, 20) : code)
                    .param("data", json.writeValueAsString(line.values())).param("outcome", e.outcome().name())
                    .param("message", stored(e)).param("user", e.userId()).update();
        }
        return get(String.valueOf(id), null, PageQuery.of(1, PageQuery.DEFAULT_SIZE));
    }

    /** The import with one page of its lines; {@code outcome} filters them (New, Update, Unchanged, Error). */
    @Transactional(readOnly = true)
    public Import get(String id, String outcome, PageQuery page) {
        currentUser.require(Permission.MANAGE_STUDENTS);
        Batch batch = batch(id, false);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("id", batch.id());
        String where = " WHERE import_id = :id";
        if (outcome != null && !outcome.isBlank()) {
            Outcome o = parseOutcome(outcome)
                    .orElseThrow(() -> ApiException.badRequest("BAD_PARAMETER", "Choose New, Update, Unchanged or Error."));
            where += " AND outcome = :outcome";
            params.put("outcome", o.name());
        }
        long total = jdbc.sql("SELECT count(*) FROM auth_student_import_row" + where).params(params).query(Long.class)
                .single();
        List<Row> rows = jdbc.sql("SELECT line_no, data::text AS data, outcome, message FROM auth_student_import_row"
                + where + " ORDER BY line_no LIMIT :limit OFFSET :offset")
                .params(params).param("limit", page.limit()).param("offset", page.offset())
                .query((rs, i) -> {
                    Map<String, String> values = json.readValue(rs.getString("data"), VALUES);
                    Outcome o = Outcome.valueOf(rs.getString("outcome"));
                    String message = rs.getString("message");
                    List<String> changes = o == Outcome.UPDATE && message != null && !message.isEmpty()
                            ? List.of(message.split(",")) : List.of();
                    return new Row(rs.getInt("line_no"), values.get("studentCode"), values.get("name"),
                            values.get("email"), label(o), o == Outcome.ERROR ? message : null, changes);
                })
                .list();
        Map<String, Long> byOutcome = new HashMap<>();
        jdbc.sql("SELECT outcome, count(*) AS n FROM auth_student_import_row WHERE import_id = :id GROUP BY outcome")
                .param("id", batch.id())
                .query((rs, i) -> Map.entry(rs.getString("outcome"), rs.getLong("n"))).list()
                .forEach(e -> byOutcome.put(e.getKey(), e.getValue()));
        Counts counts = new Counts(byOutcome.getOrDefault("NEW", 0L), byOutcome.getOrDefault("UPDATE", 0L),
                byOutcome.getOrDefault("UNCHANGED", 0L), byOutcome.getOrDefault("ERROR", 0L));
        long missing = batch.applied() ? 0 : missing(fileCodes(batch.id()));
        return new Import(String.valueOf(batch.id()), batch.fileName(), batch.applied() ? "Applied" : "Preview",
                batch.uploadedAt(), batch.uploadedBy(), batch.fields(), counts, missing, new RowPage(rows, total),
                batch.result());
    }

    /**
     * Applies the import: every line is checked again against the accounts as they are now, so the result may
     * differ from the preview when someone changed an account in between.
     */
    @Transactional
    public Import confirm(String id, boolean markMissingNotEnrolled) {
        AuthenticatedUser me = currentUser.require(Permission.MANAGE_STUDENTS);
        Batch batch = batch(id, true);
        if (batch.applied()) {
            throw ApiException.conflict("IMPORT_APPLIED", "This file was already imported.");
        }
        record Stored(long rowId, StudentListFile.Line line) {
        }
        List<Stored> stored = jdbc.sql("""
                SELECT id, line_no, data::text AS data FROM auth_student_import_row WHERE import_id = :id ORDER BY line_no
                """).param("id", batch.id())
                .query((rs, i) -> new Stored(rs.getLong("id"), new StudentListFile.Line(rs.getInt("line_no"),
                        json.readValue(rs.getString("data"), VALUES))))
                .list();
        List<Evaluation> evaluations = evaluate(stored.stream().map(Stored::line).toList(), batch.fields());
        Instant now = Instant.now(clock);
        long created = 0;
        long updated = 0;
        long unchanged = 0;
        long errors = 0;
        long verified = 0;
        for (int i = 0; i < stored.size(); i++) {
            Evaluation e = evaluations.get(i);
            Long userId = e.userId();
            switch (e.outcome()) {
                case NEW -> {
                    userId = create(e.values(), me.userId(), now);
                    created++;
                }
                case UPDATE -> {
                    update(e, batch.fields(), me.userId(), now);
                    updated++;
                    if (e.verifies()) {
                        verified++;
                        events.publishEvent(new StudentVerified(e.userId()));
                    }
                }
                case UNCHANGED -> unchanged++;
                case ERROR -> errors++;
            }
            jdbc.sql("UPDATE auth_student_import_row SET outcome = :outcome, message = :message, user_id = :user WHERE id = :id")
                    .param("outcome", e.outcome().name()).param("message", stored(e)).param("user", userId)
                    .param("id", stored.get(i).rowId()).update();
        }
        long marked = 0;
        if (markMissingNotEnrolled) {
            marked = jdbc.sql("""
                    UPDATE auth_student s SET enrollment_status = 'NOT_ENROLLED', synced_at = :now
                    FROM auth_user u
                    WHERE u.id = s.user_id AND NOT u.demo AND s.enrollment_status <> 'NOT_ENROLLED'
                      AND s.student_code <> ALL (:codes)
                    """).param("now", Timestamp.from(now)).param("codes", fileCodes(batch.id()).toArray(String[]::new))
                    .update();
        }
        jdbc.sql("""
                UPDATE auth_student_import SET status = 'APPLIED', mark_missing = :mark, applied_by = :by, applied_at = :now,
                       created_count = :created, updated_count = :updated, unchanged_count = :unchanged,
                       error_count = :errors, verified_count = :verified, marked_count = :marked
                WHERE id = :id
                """).param("mark", markMissingNotEnrolled).param("by", me.userId()).param("now", Timestamp.from(now))
                .param("created", created).param("updated", updated).param("unchanged", unchanged)
                .param("errors", errors).param("verified", verified).param("marked", marked).param("id", batch.id()).update();
        Map<String, Object> change = new LinkedHashMap<>();
        change.put("file", batch.fileName());
        change.put("created", created);
        change.put("updated", updated);
        change.put("unchanged", unchanged);
        change.put("errors", errors);
        change.put("verified", verified);
        change.put("markedNotEnrolled", marked);
        audit.record("STUDENT_LIST_IMPORTED", AuditLog.Tone.INFO, "Student list", batch.id(), batch.fileName(), change);
        return get(String.valueOf(batch.id()), null, PageQuery.of(1, PageQuery.DEFAULT_SIZE));
    }

    /** The latest imports, newest first. */
    @Transactional(readOnly = true)
    public History history(PageQuery page) {
        currentUser.require(Permission.MANAGE_STUDENTS);
        long total = jdbc.sql("SELECT count(*) FROM auth_student_import").query(Long.class).single();
        List<HistoryItem> items = jdbc.sql("""
                SELECT i.*, u.display_name AS uploader FROM auth_student_import i JOIN auth_user u ON u.id = i.uploaded_by
                ORDER BY i.uploaded_at DESC, i.id DESC LIMIT :limit OFFSET :offset
                """).param("limit", page.limit()).param("offset", page.offset())
                .query((rs, i) -> {
                    Batch b = batchOf(rs);
                    return new HistoryItem(String.valueOf(b.id()), b.fileName(), b.applied() ? "Applied" : "Preview",
                            b.uploadedAt(), b.uploadedBy(), b.appliedAt(), b.result());
                })
                .list();
        return new History(items, total);
    }

    // ---------- evaluation ----------

    private List<Evaluation> evaluate(List<StudentListFile.Line> lines, List<String> present) {
        List<Evaluation> out = new ArrayList<>();
        Map<String, Integer> codeLines = new HashMap<>();
        Map<String, Integer> emailLines = new HashMap<>();
        for (StudentListFile.Line line : lines) {
            Evaluation e = evaluate(line, present);
            if (e.outcome() != Outcome.ERROR) {
                Integer earlier = codeLines.putIfAbsent(e.values().code(), line.number());
                Integer earlierEmail = emailLines.putIfAbsent(e.values().email(), line.number());
                if (earlier != null) {
                    e = Evaluation.error("Student code " + e.values().code() + " is already on line " + earlier + ".");
                } else if (earlierEmail != null) {
                    e = Evaluation.error("This email is already on line " + earlierEmail + ".");
                }
            }
            out.add(e);
        }
        return out;
    }

    private Evaluation evaluate(StudentListFile.Line line, List<String> present) {
        Map<String, String> v = line.values();
        List<String> problems = new ArrayList<>();
        String code = StudentCodes.normalize(v.get("studentCode")).orElse(null);
        if (code == null) {
            problems.add("The student code is missing or not valid.");
        }
        String name = v.getOrDefault("name", "").replaceAll("\\s+", " ").strip();
        if (name.length() < 2 || name.length() > 150) {
            problems.add("The full name is missing.");
        }
        String email = v.getOrDefault("email", "").toLowerCase(Locale.ROOT);
        String domain = properties.google() == null ? null : properties.google().hostedDomain();
        if (!email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+") || email.length() > 254) {
            problems.add("The email is missing or not valid.");
        } else if (domain != null && !domain.isBlank() && !email.endsWith("@" + domain.toLowerCase(Locale.ROOT))) {
            problems.add("The email must end with @" + domain + ".");
        }
        String gender = StudentFields.gender(v.get("gender")).orElse(null);
        if (gender == null) {
            problems.add("The gender must be Male or Female.");
        }
        String major = fields.major(v.get("major")).orElse(null);
        if (major == null) {
            problems.add("The major is not in the list of majors.");
        }
        String cohort = StudentFields.cohort(v.get("cohort")).orElse(null);
        if (cohort == null) {
            problems.add("The cohort must look like K19.");
        }
        boolean hasDob = present.contains("dateOfBirth");
        LocalDate dob = null;
        if (hasDob && !blank(v.get("dateOfBirth"))) {
            dob = StudentFields.date(v.get("dateOfBirth")).orElse(null);
            LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
            if (dob == null || !StudentFields.plausibleBirthDate(dob, today)) {
                problems.add("The date of birth is not valid.");
            }
        }
        boolean hasSemester = present.contains("semester");
        Integer semester = null;
        if (hasSemester && !blank(v.get("semester"))) {
            try {
                semester = Integer.parseInt(v.get("semester").strip());
            } catch (NumberFormatException e) {
                semester = -1;
            }
            if (semester < 0 || semester > 12) {
                problems.add("The semester must be a number from 0 to 12.");
            }
        }
        boolean hasHometown = present.contains("hometown");
        String hometown = hasHometown && !blank(v.get("hometown")) ? v.get("hometown").strip() : null;
        if (hometown != null && hometown.length() > 100) {
            problems.add("The hometown is longer than 100 characters.");
        }
        boolean hasRegion = present.contains("region");
        String region = null;
        if (hasRegion && !blank(v.get("region"))) {
            region = fields.region(v.get("region")).orElse(null);
            if (region == null) {
                problems.add("The region is not in the list of regions.");
            }
        }
        String enrollment = null;
        if (present.contains("enrollment")) {
            enrollment = blank(v.get("enrollment")) ? "ENROLLED" : StudentFields.enrollment(v.get("enrollment")).orElse(null);
            if (enrollment == null) {
                problems.add("The enrollment status is not in the list.");
            }
        }
        List<String> groups = null;
        if (present.contains("priorityGroups")) {
            groups = blank(v.get("priorityGroups")) ? List.of()
                    : List.of(v.get("priorityGroups").split("[;|,]")).stream().map(String::strip).filter(s -> !s.isEmpty())
                            .map(s -> s.toUpperCase(Locale.ROOT)).distinct().toList();
            if (!fields.priorityGroups().containsAll(groups)) {
                problems.add("A priority group is not in the list.");
            }
        }
        if (!problems.isEmpty()) {
            return Evaluation.error(String.join(" ", problems));
        }
        Values values = new Values(code, name, email, gender, dob, hasDob, major, cohort, semester, hasSemester, hometown,
                hasHometown, region, hasRegion, enrollment, groups);

        Optional<Account> account = account(code);
        Optional<Long> emailOwner = jdbc.sql("SELECT id FROM auth_user WHERE lower(email) = :email")
                .param("email", email).query(Long.class).optional();
        if (account.isEmpty()) {
            if (emailOwner.isPresent()) {
                return Evaluation.error("This email belongs to another account.");
            }
            return new Evaluation(Outcome.NEW, null, null, values, List.of(), false, false);
        }
        Account a = account.get();
        if (emailOwner.isPresent() && emailOwner.get() != a.id()) {
            return Evaluation.error("This email belongs to another account.");
        }
        boolean pending = !"VERIFIED".equals(a.verification());
        if (pending && "SIGN_UP".equals(a.source()) && !a.email().equalsIgnoreCase(email)
                && !StudentCodes.fromEmail(a.email()).map(code::equals).orElse(false)) {
            // The code was typed on the sign-up form of another address: it does not prove who the student is.
            return Evaluation.error("Student code " + code
                    + " belongs to an account waiting for verification with another email. Check it on the student's page.");
        }
        if ("REJECTED".equals(a.verification())) {
            return Evaluation.error("Student code " + code + " belongs to a rejected account. Check it on the student's page.");
        }
        List<String> changes = new ArrayList<>();
        boolean keepEmail = a.used();
        if (!a.email().equalsIgnoreCase(email) && !keepEmail) {
            changes.add("email");
        }
        if (!a.name().equals(name)) {
            changes.add("name");
        }
        check(changes, "gender", a.gender(), gender);
        check(changes, "major", a.major(), major);
        check(changes, "cohort", a.cohort(), cohort);
        if (hasDob) {
            check(changes, "dateOfBirth", a.dateOfBirth(), dob);
        }
        if (hasSemester) {
            check(changes, "semester", a.semester(), semester);
        }
        if (hasHometown) {
            check(changes, "hometown", a.hometown(), hometown);
        }
        if (hasRegion) {
            check(changes, "region", a.region(), region);
        }
        if (enrollment != null) {
            check(changes, "enrollment", a.enrollment(), enrollment);
        }
        if (groups != null) {
            check(changes, "priorityGroups", a.priorityGroups(), groups);
        }
        if (pending) {
            changes.add("verification");
        }
        return new Evaluation(changes.isEmpty() ? Outcome.UNCHANGED : Outcome.UPDATE, null, a.id(), values, changes,
                pending, keepEmail);
    }

    /** The real student account holding the code; a fictional one gives its code up, so it does not match. */
    private Optional<Account> account(String code) {
        return jdbc.sql("""
                SELECT u.id, u.email, u.display_name, u.status,
                       u.last_sign_in_at IS NOT NULL OR u.password_hash IS NOT NULL OR u.google_sub IS NOT NULL AS used,
                       s.gender, s.date_of_birth, s.major, s.cohort, s.semester_no, s.hometown, s.region,
                       s.enrollment_status, s.priority_groups, s.verification, s.source
                FROM auth_student s JOIN auth_user u ON u.id = s.user_id
                WHERE s.student_code = :code AND NOT u.demo
                """).param("code", code)
                .query((rs, i) -> new Account(rs.getLong("id"), rs.getString("email"), rs.getString("display_name"),
                        rs.getBoolean("used"), rs.getString("gender").trim(), rs.getObject("date_of_birth", LocalDate.class),
                        rs.getString("major"), rs.getString("cohort"), rs.getObject("semester_no", Integer.class),
                        rs.getString("hometown"), rs.getString("region"), rs.getString("enrollment_status"),
                        List.of((String[]) rs.getArray("priority_groups").getArray()), rs.getString("verification"),
                        rs.getString("source"), rs.getString("status")))
                .optional();
    }

    // ---------- applying ----------

    private long create(Values v, long by, Instant now) {
        codes.releaseFromDemo(v.code());
        long id = jdbc.sql("""
                INSERT INTO auth_user (email, display_name, role, status) VALUES (:email, :name, 'STUDENT', 'INVITED')
                RETURNING id
                """).param("email", v.email()).param("name", v.name()).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO auth_student (user_id, student_code, gender, date_of_birth, major, cohort, semester_no,
                                          hometown, region, enrollment_status, priority_groups, verification,
                                          verified_at, verified_by, source, synced_at)
                VALUES (:id, :code, :gender, :dob, :major, :cohort, :semester, :hometown, :region, :enrollment, :groups,
                        'VERIFIED', :now, :by, 'IMPORT', :now)
                """)
                .param("id", id).param("code", v.code()).param("gender", v.gender()).param("dob", v.dateOfBirth())
                .param("major", v.major()).param("cohort", v.cohort()).param("semester", v.semester())
                .param("hometown", v.hometown()).param("region", v.region())
                .param("enrollment", v.enrollment() == null ? "ENROLLED" : v.enrollment())
                .param("groups", (v.priorityGroups() == null ? List.<String>of() : v.priorityGroups()).toArray(String[]::new))
                .param("now", Timestamp.from(now)).param("by", by).update();
        return id;
    }

    private void update(Evaluation e, List<String> present, long by, Instant now) {
        Values v = e.values();
        StringBuilder set = new StringBuilder("gender = :gender, major = :major, cohort = :cohort, synced_at = :now");
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("gender", v.gender());
        params.put("major", v.major());
        params.put("cohort", v.cohort());
        params.put("now", Timestamp.from(now));
        params.put("id", e.userId());
        if (v.hasDateOfBirth()) {
            set.append(", date_of_birth = :dob");
            params.put("dob", v.dateOfBirth());
        }
        if (v.hasSemester()) {
            set.append(", semester_no = :semester");
            params.put("semester", v.semester());
        }
        if (v.hasHometown()) {
            set.append(", hometown = :hometown");
            params.put("hometown", v.hometown());
        }
        if (v.hasRegion()) {
            set.append(", region = :region");
            params.put("region", v.region());
        }
        if (v.enrollment() != null) {
            set.append(", enrollment_status = :enrollment");
            params.put("enrollment", v.enrollment());
        }
        if (v.priorityGroups() != null) {
            set.append(", priority_groups = :groups");
            params.put("groups", v.priorityGroups().toArray(String[]::new));
        }
        if (e.verifies()) {
            set.append(", verification = 'VERIFIED', verification_note = NULL, verified_at = :now, verified_by = :by");
            params.put("by", by);
        }
        jdbc.sql("UPDATE auth_student SET " + set + " WHERE user_id = :id").params(params).update();
        jdbc.sql("""
                UPDATE auth_user SET display_name = :name, email = CASE WHEN :keep THEN email ELSE :email END,
                       updated_at = :now, version = version + 1
                WHERE id = :id
                """).param("name", v.name()).param("keep", e.keepEmail()).param("email", v.email())
                .param("now", Timestamp.from(now)).param("id", e.userId()).update();
    }

    // ---------- helpers ----------

    private record Batch(long id, String fileName, Instant uploadedAt, String uploadedBy, List<String> fields,
            boolean applied, Instant appliedAt, Result result) {
    }

    private Batch batch(String id, boolean forUpdate) {
        if (id == null || id.isBlank() || id.length() > 18 || !id.chars().allMatch(Character::isDigit)) {
            throw ApiException.notFound("This import does not exist.");
        }
        return jdbc.sql("""
                SELECT i.*, u.display_name AS uploader FROM auth_student_import i JOIN auth_user u ON u.id = i.uploaded_by
                WHERE i.id = :id""" + (forUpdate ? " FOR UPDATE OF i" : ""))
                .param("id", Long.parseLong(id)).query((rs, i) -> batchOf(rs)).optional()
                .orElseThrow(() -> ApiException.notFound("This import does not exist."));
    }

    private static Batch batchOf(ResultSet rs) throws SQLException {
        boolean applied = "APPLIED".equals(rs.getString("status"));
        Timestamp appliedAt = rs.getTimestamp("applied_at");
        Result result = applied ? new Result(rs.getLong("created_count"), rs.getLong("updated_count"),
                rs.getLong("unchanged_count"), rs.getLong("error_count"), rs.getLong("verified_count"), rs.getLong("marked_count")) : null;
        return new Batch(rs.getLong("id"), rs.getString("file_name"), rs.getTimestamp("uploaded_at").toInstant(),
                rs.getString("uploader"), List.of((String[]) rs.getArray("fields").getArray()), applied,
                appliedAt == null ? null : appliedAt.toInstant(), result);
    }

    /** Every student code the file lists (lines with errors included), in upper case. */
    private List<String> fileCodes(long importId) {
        return jdbc.sql("SELECT DISTINCT upper(student_code) FROM auth_student_import_row WHERE import_id = :id AND student_code IS NOT NULL")
                .param("id", importId).query(String.class).list();
    }

    /** Real students the file does not list and who are not yet Not enrolled. */
    private long missing(List<String> fileCodes) {
        return jdbc.sql("""
                SELECT count(*) FROM auth_student s JOIN auth_user u ON u.id = s.user_id
                WHERE NOT u.demo AND s.enrollment_status <> 'NOT_ENROLLED' AND s.student_code <> ALL (:codes)
                """).param("codes", fileCodes.toArray(String[]::new)).query(Long.class).single();
    }

    private static String stored(Evaluation e) {
        String message = e.outcome() == Outcome.ERROR ? e.message() : String.join(",", e.changes());
        return message == null || message.isEmpty() ? null : message.length() > 500 ? message.substring(0, 500) : message;
    }

    private static String label(Outcome o) {
        return switch (o) {
            case NEW -> "New";
            case UPDATE -> "Update";
            case UNCHANGED -> "Unchanged";
            case ERROR -> "Error";
        };
    }

    private static Optional<Outcome> parseOutcome(String value) {
        for (Outcome o : Outcome.values()) {
            if (o.name().equalsIgnoreCase(value.trim()) || label(o).equalsIgnoreCase(value.trim())) {
                return Optional.of(o);
            }
        }
        return Optional.empty();
    }

    private static void check(List<String> changes, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            changes.add(field);
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

}
