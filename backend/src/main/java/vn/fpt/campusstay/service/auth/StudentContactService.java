package vn.fpt.campusstay.service.auth;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.setting.Lookups;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * A student's own contact details on My profile: their phone and personal email, and the people the dormitory calls
 * in an emergency (up to {@code student.emergency_contacts_max}). The student's code, name, major and the other
 * directory details stay with the student list and the Managers.
 * <p>
 * The first emergency contact (lowest position) is mirrored in {@code auth_student.emergency_*}, which Applications,
 * eligibility ({@code CONTACT_COMPLETE}) and the Manager's student hub read. A student whose only contact is still in
 * those columns (base data, an Application saved it) gets it as the first of the list when the list is first read.
 */
@Service
public class StudentContactService {

    public record Option(String value, String label) {
    }

    public record EmergencyContact(String id, String name, String relationship, String relationshipLabel,
            String phone, boolean primary) {
    }

    /** Everything the profile's contact sections show and edit. */
    public record Contacts(String email, String phone, String personalEmail, List<EmergencyContact> emergencyContacts,
            int maxEmergencyContacts, List<Option> relationships) {
    }

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");
    private static final String MAX_KEY = "student.emergency_contacts_max";

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final Lookups lookups;
    private final Parameters parameters;
    private final Clock clock;

    public StudentContactService(JdbcClient jdbc, CurrentUser currentUser, Lookups lookups, Parameters parameters,
            Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.lookups = lookups;
        this.parameters = parameters;
        this.clock = clock;
    }

    @Transactional
    public Contacts mine() {
        long me = currentUser.require(Role.STUDENT).userId();
        adoptSingleContact(me);
        return read(me);
    }

    /** Phone (8 to 15 digits) and an optional personal email; the school email is the account's and stays. */
    @Transactional
    public Contacts saveContact(String phone, String personalEmail) {
        long me = currentUser.require(Role.STUDENT).userId();
        String p = trimmed(phone);
        String e = trimmed(personalEmail);
        FieldErrors errors = new FieldErrors();
        errors.check(p != null && StudentFields.phone(p), "phone", "Enter a phone number of 8 to 15 digits.");
        errors.check(e == null || (e.length() <= 254 && EMAIL.matcher(e).matches()), "personalEmail",
                "Enter a valid email address.");
        errors.throwIfAny();
        int updated = jdbc.sql("UPDATE auth_student SET phone = :phone, personal_email = :email WHERE user_id = :me")
                .param("phone", p).param("email", e).param("me", me).update();
        if (updated == 0) {
            throw ApiException.notFound("Your student record was not found.");
        }
        adoptSingleContact(me);
        return read(me);
    }

    @Transactional
    public Contacts addEmergency(String name, String relationship, String phone) {
        long me = currentUser.require(Role.STUDENT).userId();
        adoptSingleContact(me);
        Fields f = validate(name, relationship, phone);
        int count = jdbc.sql("SELECT count(*) FROM auth_student_emergency_contact WHERE student_id = :me")
                .param("me", me).query(Integer.class).single();
        int max = Math.max(1, parameters.intValue(MAX_KEY));
        if (count >= max) {
            throw ApiException.badRequest("EMERGENCY_CONTACTS_FULL",
                    "You already have the most emergency contacts allowed. Edit or remove one first.");
        }
        jdbc.sql("""
                INSERT INTO auth_student_emergency_contact (student_id, name, relationship, phone, position)
                VALUES (:me, :name, :relationship, :phone,
                        (SELECT coalesce(max(position) + 1, 0) FROM auth_student_emergency_contact WHERE student_id = :me))
                """)
                .param("me", me).param("name", f.name).param("relationship", f.relationship).param("phone", f.phone)
                .update();
        mirrorPrimary(me);
        return read(me);
    }

    @Transactional
    public Contacts updateEmergency(long id, String name, String relationship, String phone) {
        long me = currentUser.require(Role.STUDENT).userId();
        Fields f = validate(name, relationship, phone);
        int updated = jdbc.sql("""
                UPDATE auth_student_emergency_contact
                SET name = :name, relationship = :relationship, phone = :phone, updated_at = :now
                WHERE id = :id AND student_id = :me
                """)
                .param("name", f.name).param("relationship", f.relationship).param("phone", f.phone)
                .param("now", Timestamp.from(Instant.now(clock))).param("id", id).param("me", me).update();
        if (updated == 0) {
            throw ApiException.notFound("This emergency contact does not exist.");
        }
        mirrorPrimary(me);
        return read(me);
    }

    @Transactional
    public Contacts removeEmergency(long id) {
        long me = currentUser.require(Role.STUDENT).userId();
        int deleted = jdbc.sql("DELETE FROM auth_student_emergency_contact WHERE id = :id AND student_id = :me")
                .param("id", id).param("me", me).update();
        if (deleted == 0) {
            throw ApiException.notFound("This emergency contact does not exist.");
        }
        mirrorPrimary(me);
        return read(me);
    }

    /** Makes one contact the first: the one the dormitory calls first. */
    @Transactional
    public Contacts makePrimary(long id) {
        long me = currentUser.require(Role.STUDENT).userId();
        int found = jdbc.sql("SELECT count(*) FROM auth_student_emergency_contact WHERE id = :id AND student_id = :me")
                .param("id", id).param("me", me).query(Integer.class).single();
        if (found == 0) {
            throw ApiException.notFound("This emergency contact does not exist.");
        }
        jdbc.sql("""
                UPDATE auth_student_emergency_contact c
                SET position = CASE WHEN c.id = :id THEN 0
                                    ELSE 1 + (SELECT count(*) FROM auth_student_emergency_contact o
                                              WHERE o.student_id = :me AND o.id <> :id
                                                AND (o.position, o.id) < (c.position, c.id)) END
                WHERE c.student_id = :me
                """).param("id", id).param("me", me).update();
        mirrorPrimary(me);
        return read(me);
    }

    // ---------------------------------------------------------------- internals

    private record Fields(String name, String relationship, String phone) {
    }

    private Fields validate(String name, String relationship, String phone) {
        String n = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        String p = trimmed(phone);
        String r = lookups.find("RELATIONSHIP", relationship).map(Lookups.Lookup::code).orElse(null);
        FieldErrors errors = new FieldErrors();
        errors.check(n.length() >= 2 && n.length() <= 150, "name", "Enter the contact's full name.");
        errors.check(r != null, "relationship", "Choose the relationship from the list.");
        errors.check(p != null && StudentFields.phone(p), "phone", "Enter a phone number of 8 to 15 digits.");
        errors.throwIfAny();
        return new Fields(n, r, p);
    }

    /** The single contact kept in {@code auth_student} becomes the first of the list when the list is empty. */
    private void adoptSingleContact(long me) {
        jdbc.sql("""
                INSERT INTO auth_student_emergency_contact (student_id, name, relationship, phone, position)
                SELECT s.user_id, s.emergency_name, coalesce(nullif(trim(s.emergency_relationship), ''), 'OTHER'),
                       s.emergency_phone, 0
                FROM auth_student s
                WHERE s.user_id = :me
                  AND coalesce(trim(s.emergency_name), '') <> '' AND coalesce(trim(s.emergency_phone), '') <> ''
                  AND NOT EXISTS (SELECT 1 FROM auth_student_emergency_contact c WHERE c.student_id = s.user_id)
                """).param("me", me).update();
    }

    /** Copies the first contact (or nothing) into {@code auth_student.emergency_*}. */
    private void mirrorPrimary(long me) {
        jdbc.sql("""
                UPDATE auth_student s
                SET emergency_name = c.name, emergency_relationship = c.relationship, emergency_phone = c.phone
                FROM (SELECT :me AS student_id) k
                LEFT JOIN LATERAL (SELECT name, relationship, phone FROM auth_student_emergency_contact
                                   WHERE student_id = :me ORDER BY position, id LIMIT 1) c ON TRUE
                WHERE s.user_id = k.student_id
                """).param("me", me).update();
    }

    private Contacts read(long me) {
        List<Lookups.Lookup> relationships = lookups.list("RELATIONSHIP");
        record Row(long id, String name, String relationship, String phone) {
        }
        List<Row> rows = jdbc.sql("""
                SELECT id, name, relationship, phone FROM auth_student_emergency_contact
                WHERE student_id = :me ORDER BY position, id
                """).param("me", me)
                .query((rs, i) -> new Row(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4))).list();
        List<EmergencyContact> contacts = new java.util.ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Row r = rows.get(i);
            String label = relationships.stream().filter(l -> l.code().equals(r.relationship())).map(Lookups.Lookup::label)
                    .findFirst().orElse(r.relationship());
            contacts.add(new EmergencyContact(String.valueOf(r.id()), r.name(), r.relationship(), label, r.phone(), i == 0));
        }
        return jdbc.sql("""
                SELECT u.email, s.phone, s.personal_email
                FROM auth_student s JOIN auth_user u ON u.id = s.user_id WHERE s.user_id = :me
                """).param("me", me)
                .query((rs, i) -> new Contacts(rs.getString(1), rs.getString(2), rs.getString(3), List.copyOf(contacts),
                        Math.max(1, parameters.intValue(MAX_KEY)),
                        relationships.stream().map(l -> new Option(l.code(), l.label())).toList()))
                .optional().orElseThrow(() -> ApiException.notFound("Your student record was not found."));
    }

    private static String trimmed(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
