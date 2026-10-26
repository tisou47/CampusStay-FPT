package vn.fpt.campusstay.service.auth;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.entity.UserEntity;
import vn.fpt.campusstay.event.StudentVerified;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.repository.UserRepository;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.service.setting.Lookups;

/**
 * Manager › Students (spec §6.2, §11.3): the student list with its filters, the student hub, the directory fields,
 * verification of accounts that signed up, and locking. Staff read the residents of their Blocks (spec §3).
 */
@Service
public class StudentAccountService {

    /** A row of the student list; labels as the screen shows them. {@code residence} "A-301 · Bed B". */
    public record Item(String id, String studentCode, String name, String email, String gender, String cohort,
            String major, String enrollment, Verification verification, String account, String block,
            String residence, boolean demo) {
    }

    public record Counts(long pending) {
    }

    public record Options(List<String> verifications, List<String> enrollments, List<String> genders,
            List<String> cohorts, List<String> blocks) {
    }

    public record Page(List<Item> items, long total, Counts counts, Options options) {
    }

    /** List filters; labels or codes, blank = any. {@code resident} yes or no. */
    public record Filter(String q, String verification, String enrollment, String gender, String cohort,
            String resident, String block) {
    }

    /** Directory fields; {@code major} and {@code region} are codes of their option lists, with labels for display. */
    public record Profile(String studentCode, String gender, LocalDate dateOfBirth, String major, String majorLabel,
            String cohort, Integer semester, String hometown, String region, String regionLabel, String enrollment,
            List<String> priorityGroups, String phone, String emergencyName, String emergencyRelationship,
            String emergencyPhone, String source, Instant syncedAt) {
    }

    public record Account(String status, boolean passwordSet, boolean google, Instant lastSignInAt, Instant createdAt) {
    }

    public record VerificationInfo(Verification status, String note, Instant at, String by) {
    }

    public record Residence(String block, String room, String bed, boolean checkedIn) {
    }

    public record Actions(boolean edit, boolean verify, boolean reject, boolean lock, boolean unlock) {
    }

    public record Hub(String id, String name, String email, boolean demo, Account account, Profile profile,
            VerificationInfo verification, Residence residence, Map<String, List<StudentRecords.Item>> sections,
            List<AuditTrailService.AuditItem> history, Actions actions) {
    }

    /** The Manager's edit of the directory fields; {@code studentCode} changes only before verification. */
    public record Edit(String name, String studentCode, String gender, LocalDate dateOfBirth, String major,
            String cohort, Integer semester, String hometown, String region, String enrollment,
            List<String> priorityGroups, String phone) {
    }

    private record Row(long id, String name, String email, String status, boolean demo, boolean passwordSet,
            boolean google, Instant lastSignInAt, Instant createdAt, String code, String gender, LocalDate dateOfBirth,
            String major, String cohort, Integer semester, String hometown, String region, String enrollment,
            List<String> priorityGroups, String phone, String emergencyName, String emergencyRelationship,
            String emergencyPhone, String verification, String note, Instant verifiedAt, Long verifiedBy,
            String source, Instant syncedAt) {

        boolean hasProfile() {
            return code != null;
        }
    }

    private static final int SECTION_LIMIT = 20;
    private static final int HISTORY_LIMIT = 30;

    private final JdbcClient jdbc;
    private final UserRepository users;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blocks;
    private final Residences residences;
    private final List<StudentRecords> records;
    private final AuditTrailService auditTrail;
    private final StudentFields fields;
    private final StudentCodes codes;
    private final SessionService sessions;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public StudentAccountService(JdbcClient jdbc, UserRepository users, CurrentUser currentUser, BlockScope blockScope,
            BlockDirectory blocks, Residences residences, List<StudentRecords> records, AuditTrailService auditTrail,
            StudentFields fields, StudentCodes codes, SessionService sessions, ApplicationEventPublisher events,
            AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.users = users;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blocks = blocks;
        this.residences = residences;
        this.records = records;
        this.auditTrail = auditTrail;
        this.fields = fields;
        this.codes = codes;
        this.sessions = sessions;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Page list(Filter filter, PageQuery page) {
        AuthenticatedUser me = currentUser.require(Permission.VIEW_STUDENTS);
        boolean staff = me.is(Role.STAFF);
        Map<String, Object> params = new LinkedHashMap<>();
        StringBuilder where = new StringBuilder(" WHERE u.role = 'STUDENT'");
        if (staff || hasText(filter.block())) {
            // Staff read the residents of their Blocks only (spec §3).
            BlockSelection selection = blockScope.resolve(filter.block());
            idsIn(where, params, "residents", residences.residentsOf(selection.ids()), true);
        }
        if (hasText(filter.resident())) {
            String r = filter.resident().trim().toLowerCase(Locale.ROOT);
            if (!r.equals("yes") && !r.equals("no")) {
                throw ApiException.badRequest("BAD_PARAMETER", "Choose yes or no.");
            }
            idsIn(where, params, "anyResident", residences.residentsOf(blocks.allActiveIds()), r.equals("yes"));
        }
        if (hasText(filter.verification())) {
            Verification v = Verification.parse(filter.verification())
                    .orElseThrow(() -> ApiException.badRequest("BAD_PARAMETER", "Choose a verification status from the list."));
            if (v == Verification.NONE) {
                where.append(" AND s.user_id IS NULL");
            } else {
                where.append(" AND s.verification = :verification");
                params.put("verification", v.name());
            }
        }
        if (hasText(filter.enrollment())) {
            where.append(" AND s.enrollment_status = :enrollment");
            params.put("enrollment", StudentFields.enrollment(filter.enrollment())
                    .orElseThrow(() -> ApiException.badRequest("BAD_PARAMETER", "Choose an enrollment status from the list.")));
        }
        if (hasText(filter.gender())) {
            where.append(" AND s.gender = :gender");
            params.put("gender", StudentFields.gender(filter.gender())
                    .orElseThrow(() -> ApiException.badRequest("BAD_PARAMETER", "Choose Male or Female.")));
        }
        if (hasText(filter.cohort())) {
            where.append(" AND s.cohort = :cohort");
            params.put("cohort", StudentFields.cohort(filter.cohort())
                    .orElseThrow(() -> ApiException.badRequest("BAD_PARAMETER", "Choose a cohort from the list.")));
        }
        if (hasText(filter.q())) {
            where.append(" AND (u.display_name ILIKE :q OR u.email ILIKE :q OR s.student_code ILIKE :q)");
            params.put("q", "%" + escapeLike(filter.q().trim()) + "%");
        }
        String from = " FROM auth_user u LEFT JOIN auth_student s ON s.user_id = u.id";
        long total = jdbc.sql("SELECT count(*)" + from + where).params(params).query(Long.class).single();
        List<Row> rows = jdbc.sql("SELECT " + COLUMNS + from + where
                + " ORDER BY s.verification = 'PENDING' DESC, s.user_id IS NULL DESC, u.display_name, u.id"
                + " LIMIT :limit OFFSET :offset")
                .params(params).param("limit", page.limit()).param("offset", page.offset())
                .query((rs, i) -> row(rs)).list();
        Map<Long, Residences.Residence> held = residences.current(rows.stream().map(Row::id).toList());
        Map<String, String> majors = labels(fields.majors());
        List<Item> items = rows.stream().map(r -> {
            Residences.Residence h = held.get(r.id());
            return new Item(String.valueOf(r.id()), r.code(), r.name(), r.email(),
                    r.gender() == null ? null : StudentFields.genderLabel(r.gender()), r.cohort(),
                    r.major() == null ? null : majors.getOrDefault(r.major(), r.major()),
                    r.enrollment() == null ? null : StudentFields.ENROLLMENT.get(r.enrollment()),
                    Verification.of(r.verification()), accountLabel(r.status()), h == null ? null : h.block(),
                    h == null ? null : h.room() + " · Bed " + h.bed(), r.demo());
        }).toList();
        long pending = jdbc.sql("SELECT count(*) FROM auth_student WHERE verification = 'PENDING'")
                .query(Long.class).single();
        List<String> cohorts = jdbc.sql("SELECT DISTINCT cohort FROM auth_student ORDER BY cohort")
                .query(String.class).list();
        Set<Long> visible = staff ? me.blockIds() : blocks.allActiveIds();
        return new Page(items, total, new Counts(staff ? 0 : pending),
                new Options(Arrays.stream(Verification.values()).map(Verification::label).toList(),
                        List.copyOf(StudentFields.ENROLLMENT.values()), List.of("Male", "Female"), cohorts,
                        List.copyOf(blocks.codesByIds(visible).values())));
    }

    @Transactional(readOnly = true)
    public Hub hub(String id) {
        AuthenticatedUser me = currentUser.require(Permission.VIEW_STUDENTS);
        Row r = find(id, false);
        Optional<Residences.Residence> residence = residences.current(r.id());
        if (me.is(Role.STAFF) && residence.map(h -> !me.blockIds().contains(h.buildingId())).orElse(true)) {
            throw ApiException.notFound("This student does not exist.");
        }
        Map<String, List<StudentRecords.Item>> sections = new LinkedHashMap<>();
        for (String key : List.of("applications", "allocations", "invoices", "requests")) {
            sections.put(key, List.of());
        }
        for (StudentRecords source : records) {
            sections.put(source.section(), source.of(r.id(), SECTION_LIMIT));
        }
        Profile profile = null;
        if (r.hasProfile()) {
            Map<String, String> majors = labels(fields.majors());
            Map<String, String> regions = labels(fields.regions());
            profile = new Profile(r.code(), r.gender(), r.dateOfBirth(), r.major(), majors.get(r.major()), r.cohort(),
                    r.semester(), r.hometown(), r.region(), r.region() == null ? null : regions.get(r.region()),
                    StudentFields.ENROLLMENT.get(r.enrollment()), r.priorityGroups(), r.phone(), r.emergencyName(),
                    r.emergencyRelationship(), r.emergencyPhone(), sourceLabel(r.source()), r.syncedAt());
        }
        String by = r.verifiedBy() == null ? null
                : jdbc.sql("SELECT display_name FROM auth_user WHERE id = :id").param("id", r.verifiedBy())
                        .query(String.class).optional().orElse(null);
        boolean manage = Permission.MANAGE_STUDENTS.allows(me.role());
        boolean locked = "DISABLED".equals(r.status());
        boolean pending = "PENDING".equals(r.verification());
        return new Hub(String.valueOf(r.id()), r.name(), r.email(), r.demo(),
                new Account(accountLabel(r.status()), r.passwordSet(), r.google(), r.lastSignInAt(), r.createdAt()),
                profile, new VerificationInfo(Verification.of(r.verification()), r.note(), r.verifiedAt(), by),
                residence.map(h -> new Residence(h.block(), h.room(), h.bed(), h.resident())).orElse(null), sections,
                auditTrail.aboutUser(r.id(), HISTORY_LIMIT),
                new Actions(manage && r.hasProfile(), manage && pending && !locked, manage && pending && !locked,
                        manage && !locked, manage && locked));
    }

    /** Saves the directory fields a Manager corrected; the student code only while the account waits for verification. */
    @Transactional
    public Hub edit(String id, Edit edit) {
        currentUser.require(Permission.MANAGE_STUDENTS);
        Row r = find(id, true);
        if (!r.hasProfile()) {
            throw ApiException.conflict("NO_PROFILE", "This student has not sent their details yet.");
        }
        FieldErrors errors = new FieldErrors();
        String name = edit.name() == null ? "" : edit.name().strip().replaceAll("\\s+", " ");
        errors.check(name.length() >= 2 && name.length() <= 150, "name", "Enter the full name (at most 150 characters).");
        String code = r.code();
        if (edit.studentCode() != null && !edit.studentCode().strip().equalsIgnoreCase(r.code())) {
            if (!"PENDING".equals(r.verification())) {
                errors.add("studentCode", "The student code cannot change once the account is verified.");
            } else {
                code = StudentCodes.normalize(edit.studentCode()).orElse(null);
                if (code == null) {
                    errors.add("studentCode", "Enter a student code: two letters and six digits, e.g. SE190421.");
                } else {
                    String wanted = code;
                    codes.holder(wanted).filter(h -> !h.demo() && h.userId() != r.id()).ifPresent(h -> errors.add(
                            "studentCode", "This student code belongs to another account."));
                }
            }
        }
        String gender = StudentFields.gender(edit.gender()).orElse(null);
        errors.check(gender != null, "gender", "Choose Male or Female.");
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        errors.check(edit.dateOfBirth() == null || StudentFields.plausibleBirthDate(edit.dateOfBirth(), today),
                "dateOfBirth", "Enter a valid date of birth.");
        String major = fields.major(edit.major()).orElse(null);
        errors.check(major != null, "major", "Choose a major from the list.");
        String cohort = StudentFields.cohort(edit.cohort()).orElse(null);
        errors.check(cohort != null, "cohort", "Enter the cohort, e.g. K19.");
        errors.check(edit.semester() == null || (edit.semester() >= 0 && edit.semester() <= 12), "semester",
                "Enter a semester from 0 to 12.");
        String region = hasText(edit.region()) ? fields.region(edit.region()).orElse(null) : null;
        errors.check(!hasText(edit.region()) || region != null, "region", "Choose a region from the list.");
        String enrollment = StudentFields.enrollment(edit.enrollment()).orElse(null);
        errors.check(enrollment != null, "enrollment", "Choose an enrollment status from the list.");
        List<String> groups = edit.priorityGroups() == null ? r.priorityGroups()
                : edit.priorityGroups().stream().filter(Objects::nonNull).map(String::strip).distinct().toList();
        errors.check(fields.priorityGroups().containsAll(groups), "priorityGroups", "Choose priority groups from the list.");
        errors.check(!hasText(edit.phone()) || StudentFields.phone(edit.phone()), "phone",
                "Enter a phone number of 8 to 15 digits.");
        String hometown = hasText(edit.hometown()) ? edit.hometown().strip() : null;
        errors.check(hometown == null || hometown.length() <= 100, "hometown", "Use at most 100 characters.");
        errors.throwIfAny();

        Map<String, Object> change = new LinkedHashMap<>();
        diff(change, "name", r.name(), name);
        diff(change, "studentCode", r.code(), code);
        diff(change, "gender", r.gender(), gender);
        diff(change, "dateOfBirth", r.dateOfBirth(), edit.dateOfBirth());
        diff(change, "major", r.major(), major);
        diff(change, "cohort", r.cohort(), cohort);
        diff(change, "semester", r.semester(), edit.semester());
        diff(change, "hometown", r.hometown(), hometown);
        diff(change, "region", r.region(), region);
        diff(change, "enrollment", StudentFields.ENROLLMENT.get(r.enrollment()), StudentFields.ENROLLMENT.get(enrollment));
        diff(change, "priorityGroups", String.join(", ", r.priorityGroups()), String.join(", ", groups));
        String phone = hasText(edit.phone()) ? edit.phone().strip() : null;
        diff(change, "phone", r.phone(), phone);
        if (!change.isEmpty()) {
            if (!code.equals(r.code())) {
                codes.releaseFromDemo(code);
            }
            jdbc.sql("""
                    UPDATE auth_student SET student_code = :code, gender = :gender, date_of_birth = :dob, major = :major,
                           cohort = :cohort, semester_no = :semester, hometown = :hometown, region = :region,
                           enrollment_status = :enrollment, priority_groups = :groups, phone = :phone
                    WHERE user_id = :id
                    """)
                    .param("code", code).param("gender", gender).param("dob", edit.dateOfBirth()).param("major", major)
                    .param("cohort", cohort).param("semester", edit.semester()).param("hometown", hometown)
                    .param("region", region).param("enrollment", enrollment)
                    .param("groups", groups.toArray(String[]::new)).param("phone", phone).param("id", r.id())
                    .update();
            if (!name.equals(r.name())) {
                jdbc.sql("""
                        UPDATE auth_user SET display_name = :name, updated_at = :now, version = version + 1 WHERE id = :id
                        """).param("name", name).param("now", Timestamp.from(Instant.now(clock))).param("id", r.id())
                        .update();
            }
            audit.record("STUDENT_PROFILE_EDITED", AuditLog.Tone.INFO, "User", r.id(), code, change);
        }
        return hub(id);
    }

    /** A Pending account becomes Verified; its directory fields are then locked for the student (D-01). */
    @Transactional
    public void verify(String id) {
        currentUser.require(Permission.MANAGE_STUDENTS);
        Row r = pending(id);
        decide(r.id(), "VERIFIED", null);
        audit.record("STUDENT_VERIFIED", AuditLog.Tone.SUCCESS, "User", r.id(), r.code(), null);
        events.publishEvent(new StudentVerified(r.id()));
    }

    /** A Pending account is rejected: it is locked and the reason is shown when the student signs in. */
    @Transactional
    public void reject(String id, String reason) {
        currentUser.require(Permission.MANAGE_STUDENTS);
        String why = reason == null ? "" : reason.strip();
        if (why.isEmpty() || why.length() > 500) {
            throw FieldErrors.single("reason", "Enter the reason (at most 500 characters).");
        }
        Row r = pending(id);
        decide(r.id(), "REJECTED", why);
        UserEntity user = users.findById(r.id()).orElseThrow();
        user.disable();
        sessions.revokeAll(r.id());
        audit.record("STUDENT_REJECTED", AuditLog.Tone.WARNING, "User", r.id(), r.code(), Map.of("reason", why));
    }

    /** Locks the account: the student is signed out everywhere and cannot sign in until it is unlocked. */
    @Transactional
    public void lock(String id, String reason) {
        currentUser.require(Permission.MANAGE_STUDENTS);
        String why = reason == null ? "" : reason.strip();
        if (why.isEmpty() || why.length() > 500) {
            throw FieldErrors.single("reason", "Enter the reason (at most 500 characters).");
        }
        Row r = find(id, true);
        if ("DISABLED".equals(r.status())) {
            throw ApiException.conflict("ALREADY_LOCKED", "This account is already locked.");
        }
        users.findById(r.id()).orElseThrow().disable();
        sessions.revokeAll(r.id());
        audit.record("STUDENT_LOCKED", AuditLog.Tone.WARNING, "User", r.id(), r.code() == null ? r.email() : r.code(),
                Map.of("reason", why));
    }

    /** Unlocks the account; a rejected one goes back to Pending verification for another look. */
    @Transactional
    public void unlock(String id) {
        currentUser.require(Permission.MANAGE_STUDENTS);
        Row r = find(id, true);
        if (!"DISABLED".equals(r.status())) {
            throw ApiException.conflict("NOT_LOCKED", "This account is not locked.");
        }
        users.findById(r.id()).orElseThrow().restore();
        if ("REJECTED".equals(r.verification())) {
            jdbc.sql("""
                    UPDATE auth_student SET verification = 'PENDING', verification_note = NULL, verified_at = NULL,
                           verified_by = NULL WHERE user_id = :id
                    """).param("id", r.id()).update();
        }
        audit.record("STUDENT_UNLOCKED", AuditLog.Tone.INFO, "User", r.id(), r.code() == null ? r.email() : r.code(), null);
    }

    private Row pending(String id) {
        Row r = find(id, true);
        if (!"PENDING".equals(r.verification()) || "DISABLED".equals(r.status())) {
            throw ApiException.conflict("NOT_PENDING", "This account is not waiting for verification.");
        }
        return r;
    }

    private void decide(long userId, String verification, String note) {
        jdbc.sql("""
                UPDATE auth_student SET verification = :v, verification_note = :note, verified_at = :now, verified_by = :by
                WHERE user_id = :id
                """).param("v", verification).param("note", note).param("now", Timestamp.from(Instant.now(clock)))
                .param("by", currentUser.id()).param("id", userId).update();
    }

    private static final String COLUMNS = """
             u.id, u.display_name, u.email, u.status, u.demo, u.password_hash IS NOT NULL AS password_set,
             u.google_sub IS NOT NULL AS google, u.last_sign_in_at, u.created_at, s.student_code, s.gender,
             s.date_of_birth, s.major, s.cohort, s.semester_no, s.hometown, s.region, s.enrollment_status,
             s.priority_groups, s.phone, s.emergency_name, s.emergency_relationship, s.emergency_phone,
             s.verification, s.verification_note, s.verified_at, s.verified_by, s.source, s.synced_at
            """;

    /** A student account by id; anything else answers 404 (ids come from the client). */
    private Row find(String id, boolean forUpdate) {
        if (id == null || id.isBlank() || id.length() > 18 || !id.chars().allMatch(Character::isDigit)) {
            throw ApiException.notFound("This student does not exist.");
        }
        return jdbc.sql("SELECT " + COLUMNS + " FROM auth_user u LEFT JOIN auth_student s ON s.user_id = u.id"
                + " WHERE u.id = :id AND u.role = 'STUDENT'" + (forUpdate ? " FOR UPDATE OF u" : ""))
                .param("id", Long.parseLong(id)).query((rs, i) -> row(rs)).optional()
                .orElseThrow(() -> ApiException.notFound("This student does not exist."));
    }

    private static Row row(ResultSet rs) throws SQLException {
        Array groups = rs.getArray("priority_groups");
        Timestamp last = rs.getTimestamp("last_sign_in_at");
        Timestamp verifiedAt = rs.getTimestamp("verified_at");
        Timestamp synced = rs.getTimestamp("synced_at");
        String gender = rs.getString("gender");
        return new Row(rs.getLong("id"), rs.getString("display_name"), rs.getString("email"), rs.getString("status"),
                rs.getBoolean("demo"), rs.getBoolean("password_set"), rs.getBoolean("google"),
                last == null ? null : last.toInstant(), rs.getTimestamp("created_at").toInstant(),
                rs.getString("student_code"), gender == null ? null : gender.trim(),
                rs.getObject("date_of_birth", LocalDate.class), rs.getString("major"), rs.getString("cohort"),
                rs.getObject("semester_no", Integer.class), rs.getString("hometown"), rs.getString("region"),
                rs.getString("enrollment_status"), groups == null ? List.of() : List.of((String[]) groups.getArray()),
                rs.getString("phone"), rs.getString("emergency_name"), rs.getString("emergency_relationship"),
                rs.getString("emergency_phone"), rs.getString("verification"), rs.getString("verification_note"),
                verifiedAt == null ? null : verifiedAt.toInstant(), rs.getObject("verified_by", Long.class),
                rs.getString("source"), synced == null ? null : synced.toInstant());
    }

    /** {@code AND u.id IN (…)} (or NOT IN); an empty set matches nobody (or everybody). */
    private static void idsIn(StringBuilder where, Map<String, Object> params, String name, Collection<Long> ids,
            boolean in) {
        if (ids.isEmpty()) {
            if (in) {
                where.append(" AND FALSE");
            }
            return;
        }
        where.append(in ? " AND u.id IN (:" : " AND u.id NOT IN (:").append(name).append(')');
        params.put(name, List.copyOf(ids));
    }

    static String accountLabel(String status) {
        return switch (status) {
            case "ACTIVE" -> "Active";
            case "DISABLED" -> "Locked";
            default -> "Not signed in yet";
        };
    }

    private static String sourceLabel(String source) {
        return switch (source) {
            case "IMPORT" -> "Student list";
            case "SIGN_UP" -> "Sign-up form";
            default -> "Directory";
        };
    }

    private static Map<String, String> labels(List<Lookups.Lookup> lookups) {
        Map<String, String> out = new LinkedHashMap<>();
        lookups.forEach(l -> out.put(l.code(), l.label()));
        return out;
    }

    private static void diff(Map<String, Object> change, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            change.put(field, new ArrayList<>(Arrays.asList(before, after)));
        }
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
