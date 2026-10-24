package vn.fpt.campusstay.service.auth;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.StudentVerificationRequested;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;

/**
 * The sign-up form of a student whose Google account was not found in the imported student list (ADR-26,
 * spec §6.1 step 5): the student types the directory fields once and waits for a Manager. While the account is
 * Pending verification the student can correct the form; once Verified the fields are locked (D-01).
 */
@Service
public class StudentVerificationService {

    public record Option(String value, String label) {
    }

    /** The form's values: {@code gender} M or F, {@code major} a code of the MAJOR option list. */
    public record Form(String studentCode, String name, String gender, LocalDate dateOfBirth, String major,
            String cohort, String phone) {
    }

    public record Options(List<Option> genders, List<Option> majors) {
    }

    /** {@code note}: what the Manager wrote when rejecting (only seen at sign-in, since the account is locked). */
    public record Status(Verification status, boolean locked, String note, Form form, Options options) {
    }

    private record Directory(String code, String gender, LocalDate dateOfBirth, String major, String cohort,
            String phone, String verification, String note) {
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final StudentFields fields;
    private final StudentCodes codes;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    StudentVerificationService(JdbcClient jdbc, CurrentUser currentUser, StudentFields fields, StudentCodes codes,
            ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.fields = fields;
        this.codes = codes;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Status get() {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        Optional<Directory> record = directory(me.userId());
        Form form = record
                .map(d -> new Form(d.code(), me.name(), d.gender(), d.dateOfBirth(), d.major(), d.cohort(), d.phone()))
                .orElseGet(() -> {
                    // Filled from what Google says: the code at the end of the FPT address and the account's name.
                    String code = StudentCodes.fromEmail(me.email()).orElse(null);
                    return new Form(code, me.name(), null, null, null, StudentCodes.normalize(code)
                            .map(StudentFields::cohortOf).orElse(null), null);
                });
        Verification status = Verification.of(record.map(Directory::verification).orElse(null));
        return new Status(status, status == Verification.VERIFIED, record.map(Directory::note).orElse(null), form,
                new Options(List.of(new Option("M", "Male"), new Option("F", "Female")),
                        fields.majors().stream().map(m -> new Option(m.code(), m.label())).toList()));
    }

    /** Saves the form; the first time, the account becomes Pending verification and every Manager is told. */
    @Transactional
    public void submit(Form form) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        Optional<Directory> record = directory(me.userId());
        if (record.map(d -> "VERIFIED".equals(d.verification())).orElse(false)) {
            throw ApiException.conflict("ALREADY_VERIFIED",
                    "Your account is already verified. Ask a Manager to correct your details.");
        }
        FieldErrors errors = new FieldErrors();
        String code = StudentCodes.normalize(form.studentCode()).orElse(null);
        errors.check(code != null, "studentCode", "Enter your student code: two letters and six digits, e.g. SE190421.");
        String name = form.name() == null ? "" : form.name().strip().replaceAll("\\s+", " ");
        errors.check(name.length() >= 2 && name.length() <= 150, "name", "Enter your full name (at most 150 characters).");
        String gender = StudentFields.gender(form.gender()).orElse(null);
        errors.check(gender != null, "gender", "Choose Male or Female.");
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        errors.check(form.dateOfBirth() != null && StudentFields.plausibleBirthDate(form.dateOfBirth(), today),
                "dateOfBirth", "Enter your date of birth.");
        String major = fields.major(form.major()).orElse(null);
        errors.check(major != null, "major", "Choose your major from the list.");
        String cohort = StudentFields.cohort(form.cohort()).orElse(null);
        errors.check(cohort != null, "cohort", "Enter your cohort, e.g. K19.");
        errors.check(StudentFields.phone(form.phone()), "phone", "Enter a phone number of 8 to 15 digits.");
        if (code != null) {
            codes.holder(code).filter(h -> !h.demo() && h.userId() != me.userId()).ifPresent(h -> errors.add(
                    "studentCode", "This student code belongs to another account. Contact the dormitory office."));
        }
        errors.throwIfAny();

        codes.releaseFromDemo(code);
        Instant now = Instant.now(clock);
        jdbc.sql("""
                INSERT INTO auth_student (user_id, student_code, gender, date_of_birth, major, cohort, phone,
                                          verification, source, synced_at)
                VALUES (:id, :code, :gender, :dob, :major, :cohort, :phone, 'PENDING', 'SIGN_UP', :now)
                ON CONFLICT (user_id) DO UPDATE SET student_code = EXCLUDED.student_code, gender = EXCLUDED.gender,
                       date_of_birth = EXCLUDED.date_of_birth, major = EXCLUDED.major, cohort = EXCLUDED.cohort,
                       phone = EXCLUDED.phone, synced_at = EXCLUDED.synced_at
                """)
                .param("id", me.userId()).param("code", code).param("gender", gender).param("dob", form.dateOfBirth())
                .param("major", major).param("cohort", cohort).param("phone", form.phone().strip())
                .param("now", Timestamp.from(now)).update();
        jdbc.sql("UPDATE auth_user SET display_name = :name, updated_at = :now WHERE id = :id")
                .param("name", name).param("now", Timestamp.from(now)).param("id", me.userId()).update();
        audit.record(record.isEmpty() ? "STUDENT_SIGN_UP_SENT" : "STUDENT_SIGN_UP_CHANGED", AuditLog.Tone.INFO,
                "User", me.userId(), code, Map.of("studentCode", code, "name", name));
        if (record.isEmpty()) {
            List<Long> managers = jdbc.sql("SELECT id FROM auth_user WHERE role = 'MANAGER' AND status = 'ACTIVE'")
                    .query(Long.class).list();
            events.publishEvent(new StudentVerificationRequested(me.userId(), name, code, managers));
        }
    }

    private Optional<Directory> directory(long userId) {
        return jdbc.sql("""
                SELECT student_code, gender, date_of_birth, major, cohort, phone, verification, verification_note
                FROM auth_student WHERE user_id = :id
                """).param("id", userId)
                .query((rs, i) -> new Directory(rs.getString("student_code"), rs.getString("gender").trim(),
                        rs.getObject("date_of_birth", LocalDate.class), rs.getString("major"), rs.getString("cohort"),
                        rs.getString("phone"), rs.getString("verification"), rs.getString("verification_note")))
                .optional();
    }
}
