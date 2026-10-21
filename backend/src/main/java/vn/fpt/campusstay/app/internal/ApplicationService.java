package vn.fpt.campusstay.app.internal;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.app.ApplicationCreated;
import vn.fpt.campusstay.app.ApplicationSubmitted;
import vn.fpt.campusstay.app.RoommateInvited;
import vn.fpt.campusstay.auth.AuthenticatedUser;
import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.auth.Role;
import vn.fpt.campusstay.auth.UserDirectory;
import vn.fpt.campusstay.bil.Billing;
import vn.fpt.campusstay.bil.PaymentConfirmed;
import vn.fpt.campusstay.cfg.Catalog;
import vn.fpt.campusstay.cfg.FeePolicy;
import vn.fpt.campusstay.cfg.Lookups;
import vn.fpt.campusstay.cfg.Parameters;
import vn.fpt.campusstay.cfg.TermCatalog;
import vn.fpt.campusstay.cfg.TermSummary;
import vn.fpt.campusstay.shared.error.ApiException;
import vn.fpt.campusstay.shared.error.FieldErrors;
import vn.fpt.campusstay.shared.time.TimeConfig;

/**
 * The Application lifecycle up to submission (S2): create with a Deposit Invoice,
 * roommate invitation and its answer, Deposit payment, cancellation and expiry.
 * <p>Pairs (OI-03): the inviter applies and pays; the invited student accepts
 * within {@code roommateHours} and pays their own Deposit. Whoever pays first
 * waits as {@code Awaiting Roommate}; both reach the office ({@code Submitted})
 * when both have paid. A declined, expired or cancelled partner turns the other
 * Application into "matched automatically".
 */
@Service
public class ApplicationService {

    public record Preferences(String region, String semester, String major) {
    }

    public record Roommate(String mode, String studentCode, Preferences preferences) {
    }

    public record Contact(String phone, String email, String emergencyName, String relationship,
            String emergencyPhone) {
    }

    public record Consent(Boolean matching, Boolean rules) {
    }

    public record CreateCommand(Long termId, Long roomTypeId, Long roomClassId, Roommate roommate, Contact contact,
            Consent consent) {
    }

    public record Created(String id, String depositInvoiceId, Instant depositDueAt) {
    }

    public record RoommateCheck(boolean valid, int checksLeft) {
    }

    public record Responded(String applicationId, String depositInvoiceId) {
    }

    private static final Set<String> CANCELLABLE = Set.of("AWAITING_ROOMMATE", "AWAITING_DEPOSIT", "SUBMITTED",
            "UNDER_REVIEW", "APPROVED", "WAITLISTED");
    private static final String UNUSABLE_CODE = "This student code cannot be used. Check it and try again, "
            + "or choose Match me automatically.";

    private final JdbcClient jdbc;
    private final ApplicationStore applications;
    private final EligibilityService eligibility;
    private final CurrentUser currentUser;
    private final UserDirectory users;
    private final TermCatalog terms;
    private final Catalog catalog;
    private final FeePolicy fees;
    private final Lookups lookups;
    private final Parameters parameters;
    private final Billing billing;
    private final ApplicationEventPublisher events;
    private final JsonMapper json;
    private final Clock clock;

    public ApplicationService(JdbcClient jdbc, ApplicationStore applications, EligibilityService eligibility,
            CurrentUser currentUser, UserDirectory users, TermCatalog terms, Catalog catalog, FeePolicy fees,
            Lookups lookups, Parameters parameters, Billing billing, ApplicationEventPublisher events, JsonMapper json,
            Clock clock) {
        this.jdbc = jdbc;
        this.applications = applications;
        this.eligibility = eligibility;
        this.currentUser = currentUser;
        this.users = users;
        this.terms = terms;
        this.catalog = catalog;
        this.fees = fees;
        this.lookups = lookups;
        this.parameters = parameters;
        this.billing = billing;
        this.events = events;
        this.json = json;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- roommate code check

    /**
     * Privacy-safe check (architecture §8.4): the same answer for every code that
     * cannot be used, and a limited number of checks per Term.
     */
    @Transactional
    public RoommateCheck checkRoommate(Long termId, String studentCode) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        TermSummary term = openTerm(termId);
        int limit = parameters.intValue("application.roommate_check_attempts");
        int used = jdbc.sql("SELECT count(*) FROM app_roommate_check WHERE term_id = :term AND student_id = :student")
                .param("term", term.id()).param("student", me.userId()).query(Integer.class).single();
        if (used >= limit) {
            throw ApiException.tooManyRequests("ROOMMATE_CHECKS_EXHAUSTED",
                    "You have used all roommate code checks for this Term. Choose Match me automatically.");
        }
        boolean valid = usablePartner(me.userId(), term, studentCode).isPresent();
        jdbc.sql("INSERT INTO app_roommate_check (term_id, student_id, valid, at) VALUES (:term, :student, :valid, :at)")
                .param("term", term.id()).param("student", me.userId()).param("valid", valid)
                .param("at", Timestamp.from(Instant.now(clock))).update();
        return new RoommateCheck(valid, limit - used - 1);
    }

    /** An enrolled student of the same gender, not yourself, without an Application or pending invitation this Term. */
    private Optional<UserDirectory.StudentProfile> usablePartner(long me, TermSummary term, String studentCode) {
        UserDirectory.StudentProfile mine = users.studentProfile(me).orElseThrow();
        return users.studentByCode(studentCode)
                .filter(p -> p.userId() != me)
                .filter(p -> p.enrollmentStatus().equals("ENROLLED"))
                .filter(p -> p.gender().equals(mine.gender()))
                .filter(p -> applications.live(p.userId(), term.id()).isEmpty())
                .filter(p -> jdbc.sql("""
                        SELECT count(*) FROM app_roommate_invitation
                        WHERE term_id = :term AND invitee_student_id = :student AND status = 'PENDING'
                        """).param("term", term.id()).param("student", p.userId()).query(Long.class).single() == 0);
    }

    // ---------------------------------------------------------------- create

    @Transactional
    public Created create(CreateCommand cmd) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        TermSummary term = openTerm(cmd.termId());
        EligibilityService.Result check = eligibility.check(me.userId(), term);
        if (!check.eligible()) {
            throw ApiException.conflict("NOT_ELIGIBLE", "You cannot apply for " + term.name() + ". " + check.reasons());
        }

        FieldErrors errors = new FieldErrors();
        Catalog.RoomTypeInfo type = cmd.roomTypeId() == null ? null : catalog.roomTypes().stream()
                .filter(t -> t.id() == cmd.roomTypeId() && t.active()).findFirst().orElse(null);
        errors.check(type != null, "roomTypeId", "Choose a Room Type.");
        Catalog.RoomClassInfo roomClass = cmd.roomClassId() == null ? null : catalog.roomClasses().stream()
                .filter(c -> c.id() == cmd.roomClassId() && c.active()).findFirst().orElse(null);
        errors.check(roomClass != null, "roomClassId", "Choose a Room Class.");

        Roommate roommate = cmd.roommate();
        String mode = roommate == null || roommate.mode() == null ? "auto"
                : roommate.mode().trim().toLowerCase(Locale.ROOT);
        errors.check(mode.equals("auto") || mode.equals("invite"), "roommate",
                "Choose Invite a roommate or Match me automatically.");
        boolean invite = mode.equals("invite");
        if (invite && type != null && !type.mutual()) {
            errors.add("roommate", "You can invite a roommate only for a 2-bed Room Type.");
        }
        Map<String, String> preferences = null;
        if (!invite && roommate != null && roommate.preferences() != null && type != null && type.beds() == 2) {
            preferences = new LinkedHashMap<>();
            preferences.put("region", code("REGION", roommate.preferences().region(), "region", errors));
            preferences.put("semester", code("SEMESTER", roommate.preferences().semester(), "semester", errors));
            preferences.put("major", code("MAJOR", roommate.preferences().major(), "major", errors));
        }
        Map<String, String> contact = contact(cmd.contact(), errors);
        Consent consent = cmd.consent();
        errors.check(consent != null && Boolean.TRUE.equals(consent.matching()) && Boolean.TRUE.equals(consent.rules()),
                "consent", "Tick both consent boxes to apply.");
        errors.throwIfAny();

        UserDirectory.StudentProfile partner = null;
        if (invite) {
            partner = usablePartner(me.userId(), term, roommate.studentCode())
                    .orElseThrow(() -> FieldErrors.single("roommate", UNUSABLE_CODE));
        }
        long termPrice = fees.termPrice(type.id(), roomClass.id())
                .orElseThrow(() -> FieldErrors.single("roomClassId", "This Room Type and Room Class are not offered."));
        long deposit = fees.deposit(termPrice);
        Instant now = Instant.now(clock);
        Instant depositDueAt = now.plus(Duration.ofHours(term.depositWindowHours()));

        UserDirectory.StudentProfile student = users.studentProfile(me.userId()).orElseThrow();
        NewApplication created = insert(term, student, type.id(), roomClass.id(), termPrice, roomClass.surchargeRate(),
                deposit, invite ? "INVITE" : "AUTO", preferences, contact, depositDueAt, null);
        Billing.IssuedInvoice invoice = billing.issueDeposit(new Billing.DepositRequest(term.id(), me.userId(),
                created.id(), created.code(), termPrice, deposit, depositDueAt));
        applications.event(created.id(), "AWAITING_DEPOSIT", "Application created", null, me.userId());
        users.saveStudentContact(me.userId(), contact.get("phone"), contact.get("emergencyName"),
                lookups.find("RELATIONSHIP", contact.get("relationship")).map(Lookups.Lookup::code).orElse(null),
                contact.get("emergencyPhone"));
        if (invite) {
            Instant expires = now.plus(Duration.ofHours(term.roommateHours()));
            long invitationId = jdbc.sql("""
                    INSERT INTO app_roommate_invitation (term_id, inviter_application_id, invitee_student_id, expires_at,
                                                         created_at)
                    VALUES (:term, :app, :invitee, :expires, :now) RETURNING id
                    """)
                    .param("term", term.id()).param("app", created.id()).param("invitee", partner.userId())
                    .param("expires", Timestamp.from(expires)).param("now", Timestamp.from(now))
                    .query(Long.class).single();
            applications.event(created.id(), "AWAITING_DEPOSIT", "Roommate invitation sent", null, me.userId());
            events.publishEvent(new RoommateInvited(invitationId, partner.userId(), me.name(), type.name(), term.name(),
                    expires));
        }
        events.publishEvent(new ApplicationCreated(created.id(), created.code(), me.userId(), term.name(), deposit,
                depositDueAt, invoice.code()));
        return new Created(created.code(), invoice.code(), depositDueAt);
    }

    private record NewApplication(long id, String code) {
    }

    private NewApplication insert(TermSummary term, UserDirectory.StudentProfile student, long roomTypeId,
            long roomClassId, long termPrice, BigDecimal surchargeRate, long deposit, String mode,
            Map<String, String> preferences, Map<String, String> contact, Instant depositDueAt, Long partnerId) {
        Timestamp now = Timestamp.from(Instant.now(clock));
        return jdbc.sql("""
                WITH next AS (SELECT nextval(pg_get_serial_sequence('app_application', 'id')) AS id)
                INSERT INTO app_application (id, code, term_id, student_id, room_type_id, room_class_id, term_price,
                                             surcharge_rate, deposit_amount, status, roommate_mode, partner_application_id,
                                             roommate_preferences, contact, consent_matching, consent_rules, consented_at,
                                             deposit_due_at, created_at, updated_at, student_name, student_code, gender)
                OVERRIDING SYSTEM VALUE
                SELECT id, 'APP-' || :termCode || '-' || lpad(id::text, greatest(6, length(id::text)), '0'),
                       :term, :student, :type, :class, :price, :surcharge, :deposit, 'AWAITING_DEPOSIT', :mode, :partner,
                       CAST(:preferences AS jsonb), CAST(:contact AS jsonb), TRUE, TRUE, :now, :due, :now, :now,
                       :studentName, :studentCode, :gender
                FROM next
                RETURNING id, code
                """)
                .param("termCode", term.code())
                .param("term", term.id())
                .param("student", student.userId())
                .param("studentName", student.name())
                .param("studentCode", student.studentCode())
                .param("gender", student.gender())
                .param("type", roomTypeId)
                .param("class", roomClassId)
                .param("price", termPrice)
                .param("surcharge", surchargeRate)
                .param("deposit", deposit)
                .param("mode", mode)
                .param("partner", partnerId)
                .param("preferences", preferences == null ? null : json.writeValueAsString(preferences))
                .param("contact", json.writeValueAsString(contact))
                .param("now", now)
                .param("due", Timestamp.from(depositDueAt))
                .query((rs, i) -> new NewApplication(rs.getLong("id"), rs.getString("code")))
                .single();
    }

    // ---------------------------------------------------------------- invitation answer

    @Transactional
    public Responded respond(long invitationId, boolean accept) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        record Invitation(long id, long termId, long inviterApplicationId, Instant expiresAt) {
        }
        Invitation invitation = jdbc.sql("""
                SELECT id, term_id, inviter_application_id, expires_at FROM app_roommate_invitation
                WHERE id = :id AND invitee_student_id = :me AND status = 'PENDING' FOR UPDATE
                """)
                .param("id", invitationId).param("me", me.userId())
                .query((rs, i) -> new Invitation(rs.getLong("id"), rs.getLong("term_id"),
                        rs.getLong("inviter_application_id"), rs.getTimestamp("expires_at").toInstant()))
                .optional()
                .orElseThrow(() -> ApiException.notFound("This invitation does not exist or was already answered."));
        Instant now = Instant.now(clock);
        ApplicationStore.Application inviter = applications.find(invitation.inviterApplicationId(), true).orElseThrow();
        if (!invitation.expiresAt().isAfter(now) || !inviter.live()) {
            // The expiry job closes it and frees the inviter.
            throw ApiException.conflict("INVITATION_CLOSED", "This invitation is no longer open.");
        }
        if (!accept) {
            closeInvitation(invitation.id(), "DECLINED");
            dropRoommate(inviter, "Roommate invitation not accepted");
            return new Responded(null, null);
        }

        TermSummary term = openTerm(invitation.termId());
        EligibilityService.Result check = eligibility.check(me.userId(), term);
        if (!check.eligible()) {
            throw ApiException.conflict("NOT_ELIGIBLE", "You cannot apply for " + term.name() + ". " + check.reasons());
        }
        UserDirectory.StudentProfile profile = users.studentProfile(me.userId()).orElseThrow();
        Map<String, String> contact = new LinkedHashMap<>();
        contact.put("phone", profile.phone());
        contact.put("email", null);
        contact.put("emergencyName", profile.emergencyName());
        contact.put("relationship", lookups.find("RELATIONSHIP", profile.emergencyRelationship())
                .map(Lookups.Lookup::label).orElse(profile.emergencyRelationship()));
        contact.put("emergencyPhone", profile.emergencyPhone());
        Instant depositDueAt = now.plus(Duration.ofHours(term.depositWindowHours()));
        // Accepting the invitation on its screen is the consent to matching and the rules (it states both).
        NewApplication created = insert(term, profile, inviter.roomTypeId(), inviter.roomClassId(),
                inviter.termPrice(), inviter.surchargeRate(), inviter.depositAmount(), "INVITE", null, contact,
                depositDueAt, inviter.id());
        Billing.IssuedInvoice invoice = billing.issueDeposit(new Billing.DepositRequest(term.id(), me.userId(),
                created.id(), created.code(), inviter.termPrice(), inviter.depositAmount(), depositDueAt));
        jdbc.sql("UPDATE app_application SET partner_application_id = :partner, updated_at = :now WHERE id = :id")
                .param("partner", created.id()).param("now", Timestamp.from(now)).param("id", inviter.id()).update();
        jdbc.sql("""
                UPDATE app_roommate_invitation SET status = 'ACCEPTED', invitee_application_id = :app,
                       responded_at = :now, version = version + 1
                WHERE id = :id
                """)
                .param("app", created.id()).param("now", Timestamp.from(now)).param("id", invitation.id()).update();
        applications.event(created.id(), "AWAITING_DEPOSIT", "Roommate invitation accepted", null, me.userId());
        applications.event(inviter.id(), inviter.status(), "Roommate accepted the invitation", null, me.userId());
        events.publishEvent(new ApplicationCreated(created.id(), created.code(), me.userId(), term.name(),
                inviter.depositAmount(), depositDueAt, invoice.code()));
        return new Responded(created.code(), invoice.code());
    }

    // ---------------------------------------------------------------- Deposit paid

    /** Runs in BIL's transaction: the Application and the Payment commit together. */
    @EventListener
    void on(PaymentConfirmed payment) {
        if (!payment.type().equals("DEPOSIT") || payment.applicationId() == null) {
            return;
        }
        ApplicationStore.Application app = applications.find(payment.applicationId(), true).orElse(null);
        if (app == null || !app.status().equals("AWAITING_DEPOSIT")) {
            return;
        }
        jdbc.sql("UPDATE app_application SET submitted_at = :paidAt, updated_at = :paidAt WHERE id = :id")
                .param("paidAt", Timestamp.from(payment.paidAt())).param("id", app.id()).update();
        applications.event(app.id(), "AWAITING_DEPOSIT", "Deposit paid", null, null);
        if (app.roommateMode().equals("INVITE") && waitingForPartner(app)) {
            applications.transition(app.id(), Set.of("AWAITING_DEPOSIT"), "AWAITING_ROOMMATE");
            applications.event(app.id(), "AWAITING_ROOMMATE", "Waiting for your roommate", null, null);
            return;
        }
        submit(app, Set.of("AWAITING_DEPOSIT"));
        if (app.partnerApplicationId() != null) {
            applications.find(app.partnerApplicationId(), true)
                    .filter(p -> p.status().equals("AWAITING_ROOMMATE"))
                    .ifPresent(p -> submit(p, Set.of("AWAITING_ROOMMATE")));
        }
    }

    /** The partner has not paid yet, or the invitation is still unanswered. */
    private boolean waitingForPartner(ApplicationStore.Application app) {
        if (app.partnerApplicationId() != null) {
            return applications.find(app.partnerApplicationId(), true)
                    .map(p -> p.status().equals("AWAITING_DEPOSIT")).orElse(false);
        }
        return jdbc.sql("""
                SELECT count(*) FROM app_roommate_invitation WHERE inviter_application_id = :app AND status = 'PENDING'
                """).param("app", app.id()).query(Long.class).single() > 0;
    }

    private void submit(ApplicationStore.Application app, Set<String> from) {
        if (applications.transition(app.id(), from, "SUBMITTED")) {
            applications.event(app.id(), "SUBMITTED", "Submitted to the dormitory office", null, null);
            TermSummary term = terms.findPublished(app.termId()).orElseThrow();
            events.publishEvent(new ApplicationSubmitted(app.id(), app.code(), app.studentId(), term.name(),
                    term.resultsPublishedAt()));
        }
    }

    // ---------------------------------------------------------------- cancel

    @Transactional
    public void cancel(String idOrCode, String reason) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        ApplicationStore.Application app = applications.find(idOrCode)
                .filter(a -> a.studentId() == me.userId())
                .flatMap(a -> applications.find(a.id(), true))
                .orElseThrow(() -> ApiException.notFound("This Application does not exist."));
        TermSummary term = terms.findPublished(app.termId()).orElseThrow();
        if (!canCancel(app, term)) {
            throw ApiException.conflict("CANNOT_CANCEL", "This Application can no longer be cancelled here. "
                    + "Contact the dormitory office.");
        }
        String note = reason == null || reason.isBlank() ? null : reason.trim();
        jdbc.sql("""
                UPDATE app_application SET status = 'CANCELLED', cancelled_at = :now, cancel_reason = :reason,
                       updated_at = :now, version = version + 1
                WHERE id = :id
                """)
                .param("now", Timestamp.from(Instant.now(clock))).param("reason", note).param("id", app.id()).update();
        applications.event(app.id(), "CANCELLED", "Cancelled by you", note, me.userId());
        boolean beforeResults = Instant.now(clock).isBefore(term.resultsPublishedAt());
        for (Billing.InvoiceLine invoice : billing.invoicesOfApplication(app.id())) {
            if (!billing.voidUnpaid(invoice.id(), "Application cancelled") && billing.isPaid(invoice.id())) {
                billing.requestRefund(invoice.id(), "APPLICATION_CANCEL", app.id(),
                        "Application " + app.code() + " cancelled by the student",
                        beforeResults ? "CANCEL_BEFORE_RESULTS" : "CANCEL_AFTER_RESULTS");
            }
        }
        cancelPendingInvitation(app.id());
        if (app.partnerApplicationId() != null) {
            applications.find(app.partnerApplicationId(), true)
                    .ifPresent(p -> dropRoommate(p, "Your roommate cancelled their Application"));
        }
    }

    /** Before the deadline of {@code application.cancel_until}, and not once a Bed is allocated. */
    boolean canCancel(ApplicationStore.Application app, TermSummary term) {
        if (!CANCELLABLE.contains(app.status())) {
            return false;
        }
        return Instant.now(clock).isBefore(cancelDeadline(term));
    }

    Instant cancelDeadline(TermSummary term) {
        return parameters.textValue("application.cancel_until").equals("CHECK_IN_START")
                ? term.checkInStart().atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant()
                : term.resultsPublishedAt();
    }

    // ---------------------------------------------------------------- expiry (scheduled)

    /** Applications whose Deposit window passed, and invitations nobody answered. Idempotent. */
    @Transactional
    public int expireOverdue() {
        Instant now = Instant.now(clock);
        List<Long> overdue = jdbc.sql("""
                SELECT id FROM app_application WHERE status = 'AWAITING_DEPOSIT' AND deposit_due_at < :now
                ORDER BY id FOR UPDATE SKIP LOCKED
                """).param("now", Timestamp.from(now)).query(Long.class).list();
        int expired = 0;
        for (long id : overdue) {
            ApplicationStore.Application app = applications.find(id, true).orElseThrow();
            List<Billing.InvoiceLine> invoices = billing.invoicesOfApplication(id);
            if (invoices.stream().anyMatch(i -> billing.isPaid(i.id()))) {
                continue; // paid at the last moment: the payment listener moves it on
            }
            if (applications.transition(id, Set.of("AWAITING_DEPOSIT"), "EXPIRED")) {
                expired++;
                applications.event(id, "EXPIRED", "Expired: the Deposit was not paid in time", null, null);
                invoices.forEach(i -> billing.voidUnpaid(i.id(), "Deposit window passed"));
                cancelPendingInvitation(id);
                if (app.partnerApplicationId() != null) {
                    applications.find(app.partnerApplicationId(), true)
                            .ifPresent(p -> dropRoommate(p, "Your roommate did not pay the Deposit in time"));
                }
            }
        }
        List<long[]> invitations = jdbc.sql("""
                SELECT id, inviter_application_id FROM app_roommate_invitation
                WHERE status = 'PENDING' AND expires_at < :now ORDER BY id FOR UPDATE SKIP LOCKED
                """).param("now", Timestamp.from(now))
                .query((rs, i) -> new long[] { rs.getLong("id"), rs.getLong("inviter_application_id") }).list();
        for (long[] inv : invitations) {
            closeInvitation(inv[0], "EXPIRED");
            applications.find(inv[1], true).ifPresent(a -> dropRoommate(a, "Roommate invitation expired"));
        }
        return expired;
    }

    // ---------------------------------------------------------------- helpers

    /** The pair is off: the remaining Application is matched automatically and, if paid, submitted. */
    void dropRoommate(ApplicationStore.Application app, String text) {
        if (!app.live() || !app.roommateMode().equals("INVITE")) {
            return;
        }
        jdbc.sql("""
                UPDATE app_application SET roommate_mode = 'AUTO', partner_application_id = NULL, updated_at = :now,
                       version = version + 1
                WHERE id = :id
                """).param("now", Timestamp.from(Instant.now(clock))).param("id", app.id()).update();
        applications.event(app.id(), app.status(), text, "You will be matched automatically.", null);
        if (app.status().equals("AWAITING_ROOMMATE")) {
            submit(app, Set.of("AWAITING_ROOMMATE"));
        }
    }

    void cancelPendingInvitation(long inviterApplicationId) {
        jdbc.sql("""
                UPDATE app_roommate_invitation SET status = 'CANCELLED', responded_at = :now, version = version + 1
                WHERE inviter_application_id = :app AND status = 'PENDING'
                """).param("now", Timestamp.from(Instant.now(clock))).param("app", inviterApplicationId).update();
    }

    private void closeInvitation(long id, String status) {
        jdbc.sql("""
                UPDATE app_roommate_invitation SET status = :status, responded_at = :now, version = version + 1
                WHERE id = :id AND status = 'PENDING'
                """).param("status", status).param("now", Timestamp.from(Instant.now(clock))).param("id", id).update();
    }

    /** The Term must be open for registration (the system sets the Term; the student cannot pick another). */
    private TermSummary openTerm(Long termId) {
        TermSummary term = eligibility.registrationTerm(termId)
                .orElseThrow(() -> ApiException.conflict("REGISTRATION_CLOSED", "No Term is open for registration now."));
        if (!term.registrationOpen()) {
            throw ApiException.conflict("REGISTRATION_CLOSED", "Registration for " + term.name() + " is not open.");
        }
        return term;
    }

    private String code(String list, String value, String field, FieldErrors errors) {
        Optional<Lookups.Lookup> found = lookups.find(list, value);
        errors.check(found.isPresent(), "roommate", "Choose a " + field + " from the list.");
        return found.map(Lookups.Lookup::code).orElse(null);
    }

    /** Snapshot for this Application; phone and emergency contact are required. */
    private Map<String, String> contact(Contact c, FieldErrors errors) {
        Contact contact = c == null ? new Contact(null, null, null, null, null) : c;
        errors.check(phone(contact.phone()), "phone", "Enter a phone number of 8 to 15 digits.");
        errors.check(hasText(contact.emergencyName()) && contact.emergencyName().trim().length() <= 150,
                "emergencyName", "Enter the emergency contact's name.");
        Optional<Lookups.Lookup> relationship = lookups.find("RELATIONSHIP", contact.relationship());
        errors.check(relationship.isPresent(), "relationship", "Choose the relationship.");
        errors.check(phone(contact.emergencyPhone()), "emergencyPhone", "Enter a phone number of 8 to 15 digits.");
        errors.check(!hasText(contact.email()) || contact.email().trim().matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")
                && contact.email().trim().length() <= 254, "email", "Enter a valid email.");
        Map<String, String> snapshot = new LinkedHashMap<>();
        snapshot.put("phone", trim(contact.phone()));
        snapshot.put("email", hasText(contact.email()) ? contact.email().trim() : null);
        snapshot.put("emergencyName", trim(contact.emergencyName()));
        snapshot.put("relationship", relationship.map(Lookups.Lookup::label).orElse(null));
        snapshot.put("emergencyPhone", trim(contact.emergencyPhone()));
        return snapshot;
    }

    private static boolean phone(String value) {
        if (!hasText(value) || !value.trim().matches("\\+?[0-9 .()-]{8,20}")) {
            return false;
        }
        long digits = value.chars().filter(Character::isDigit).count();
        return digits >= 8 && digits <= 15;
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private static String trim(String s) {
        return s == null ? null : s.trim();
    }
}
