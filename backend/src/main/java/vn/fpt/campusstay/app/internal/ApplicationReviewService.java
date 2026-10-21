package vn.fpt.campusstay.app.internal;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.app.ApplicationRejected;
import vn.fpt.campusstay.auth.AuthenticatedUser;
import vn.fpt.campusstay.auth.BlockScope;
import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.auth.Permission;
import vn.fpt.campusstay.auth.UserDirectory;
import vn.fpt.campusstay.bil.Billing;
import vn.fpt.campusstay.cfg.Catalog;
import vn.fpt.campusstay.cfg.Lookups;
import vn.fpt.campusstay.cfg.TermCatalog;
import vn.fpt.campusstay.cfg.TermSummary;
import vn.fpt.campusstay.inv.Buildings;
import vn.fpt.campusstay.shared.audit.AuditLog;
import vn.fpt.campusstay.shared.error.ApiException;
import vn.fpt.campusstay.shared.error.FieldErrors;
import vn.fpt.campusstay.shared.web.PageQuery;

/**
 * Staff and Manager › Applications: the review queue, the back-office view and
 * the decision. Scope: an Application has no Bed yet, so it belongs to the Blocks
 * of its student's gender (a Block houses one gender); the user's Blocks decide
 * which genders they see.
 */
@Service
public class ApplicationReviewService {

    public record QueueItem(String id, String studentName, String studentCode, boolean pair, String roomTypeName,
            String roomClassName, String depositStatus, Instant depositPaidAt, String status) {
    }

    public record QueuePage(List<QueueItem> items, long total, Map<String, Long> counts) {
    }

    /** Filters as the queue sends them; {@code status} may be a comma-separated list of labels. */
    public record Filter(Long termId, String block, String q, String status, Long roomTypeId, Long roomClassId,
            String submittedWithin) {
    }

    public record Student(String name, String studentCode, String gender, String cohort, String major, String hometown,
            String phone, String emergencyContact, Instant syncedAt) {
    }

    public record Roommate(String mode, String studentCode, String status) {
    }

    public record Check(String title, boolean passed) {
    }

    public record Deposit(String invoiceId, long amount, String method, Instant paidAt, String status) {
    }

    public record Activity(String text, Instant at) {
    }

    public record ReviewDetail(String id, String status, String termName, Student student, String roomTypeName,
            String roomClassName, BigDecimal surchargeRate, long termPrice, Roommate roommate, List<Check> eligibility,
            Deposit deposit, List<Activity> activity) {
    }

    public record BulkResult(int approved, int skipped) {
    }

    /** The statuses the queue counts (and shows when no status is chosen, with Allocated and Cancelled). */
    private static final List<String> COUNTED = List.of("SUBMITTED", "UNDER_REVIEW", "APPROVED", "WAITLISTED",
            "REJECTED", "EXPIRED");
    private static final Set<String> REVIEWABLE = Set.of("SUBMITTED", "UNDER_REVIEW");

    private final JdbcClient jdbc;
    private final ApplicationStore applications;
    private final ApplicationService lifecycle;
    private final EligibilityService eligibility;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final Buildings buildings;
    private final UserDirectory users;
    private final TermCatalog terms;
    private final Catalog catalog;
    private final Lookups lookups;
    private final Billing billing;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final JsonMapper json;
    private final Clock clock;

    public ApplicationReviewService(JdbcClient jdbc, ApplicationStore applications, ApplicationService lifecycle,
            EligibilityService eligibility, CurrentUser currentUser, BlockScope blockScope, Buildings buildings,
            UserDirectory users, TermCatalog terms, Catalog catalog, Lookups lookups, Billing billing,
            ApplicationEventPublisher events, AuditLog audit, JsonMapper json, Clock clock) {
        this.jdbc = jdbc;
        this.applications = applications;
        this.lifecycle = lifecycle;
        this.eligibility = eligibility;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.buildings = buildings;
        this.users = users;
        this.terms = terms;
        this.catalog = catalog;
        this.lookups = lookups;
        this.billing = billing;
        this.events = events;
        this.audit = audit;
        this.json = json;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- queue

    @Transactional(readOnly = true)
    public QueuePage queue(Filter f, PageQuery page) {
        currentUser.require(Permission.REVIEW_APPLICATIONS);
        Set<String> genders = genders(f.block());
        TermSummary term = term(f.termId());
        Map<String, Object> params = new LinkedHashMap<>();
        StringBuilder where = new StringBuilder(" WHERE term_id = :term AND gender IN (:genders)"
                + " AND status NOT IN ('DRAFT', 'AWAITING_DEPOSIT', 'AWAITING_ROOMMATE')");
        params.put("term", term.id());
        params.put("genders", List.copyOf(genders));
        if (f.q() != null && !f.q().isBlank()) {
            where.append(" AND (student_name ILIKE :q OR student_code ILIKE :q OR code ILIKE :q)");
            params.put("q", "%" + f.q().trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        if (f.roomTypeId() != null) {
            where.append(" AND room_type_id = :type");
            params.put("type", f.roomTypeId());
        }
        if (f.roomClassId() != null) {
            where.append(" AND room_class_id = :class");
            params.put("class", f.roomClassId());
        }
        if (f.submittedWithin() != null && !f.submittedWithin().isBlank()) {
            Duration window = switch (f.submittedWithin()) {
                case "24h" -> Duration.ofHours(24);
                case "7d" -> Duration.ofDays(7);
                default -> throw ApiException.badRequest("BAD_PARAMETER", "Choose 24h or 7d.");
            };
            where.append(" AND submitted_at >= :since");
            params.put("since", Timestamp.from(Instant.now(clock).minus(window)));
        }
        Map<String, Long> counts = new LinkedHashMap<>();
        COUNTED.forEach(s -> counts.put(ApplicationStore.label(s), 0L));
        jdbc.sql("SELECT status, count(*) AS n FROM app_application" + where + " GROUP BY status").params(params)
                .query((rs, i) -> Map.entry(rs.getString("status"), rs.getLong("n"))).list()
                .forEach(e -> {
                    if (COUNTED.contains(e.getKey())) {
                        counts.put(ApplicationStore.label(e.getKey()), e.getValue());
                    }
                });
        if (f.status() != null && !f.status().isBlank()) {
            where.append(" AND status IN (:statuses)");
            params.put("statuses", statusCodes(f.status()));
        }
        long total = jdbc.sql("SELECT count(*) FROM app_application" + where).params(params).query(Long.class).single();
        List<Long> ids = jdbc.sql("SELECT id FROM app_application" + where
                + " ORDER BY submitted_at NULLS LAST, id LIMIT :limit OFFSET :offset")
                .params(params).param("limit", page.limit()).param("offset", page.offset()).query(Long.class).list();
        List<ApplicationStore.Application> rows = ids.stream().map(id -> applications.find(id, false).orElseThrow())
                .toList();
        Map<Long, Billing.InvoiceLine> deposits = billing.depositsOf(ids);
        Names names = names();
        List<QueueItem> items = rows.stream().map(a -> {
            Billing.InvoiceLine deposit = deposits.get(a.id());
            return new QueueItem(a.code(), a.studentName(), a.studentCode(), a.partnerApplicationId() != null,
                    names.type(a.roomTypeId()), names.roomClass(a.roomClassId()),
                    deposit == null ? null : deposit.status(), deposit == null ? null : deposit.paidAt(),
                    ApplicationStore.label(a.status()));
        }).toList();
        return new QueuePage(items, total, counts);
    }

    // ---------------------------------------------------------------- back-office view

    /** Opening a Submitted Application starts its review (the student sees "Under Review"). */
    @Transactional
    public ReviewDetail detail(String idOrCode) {
        AuthenticatedUser user = currentUser.require(Permission.REVIEW_APPLICATIONS);
        ApplicationStore.Application app = inScope(idOrCode);
        if (applications.transition(app.id(), Set.of("SUBMITTED"), "UNDER_REVIEW")) {
            applications.event(app.id(), "UNDER_REVIEW", "Under review by the dormitory office", null, user.userId());
            app = applications.find(app.id(), false).orElseThrow();
        }
        TermSummary term = terms.findPublished(app.termId()).orElseThrow();
        UserDirectory.StudentProfile profile = users.studentProfile(app.studentId()).orElse(null);
        Map<String, String> contact = json.readValue(app.contact(), new TypeReference<Map<String, String>>() {
        });
        String emergency = contact.get("emergencyName") == null ? null
                : contact.get("emergencyName")
                        + (contact.get("relationship") == null ? "" : " (" + contact.get("relationship") + ")")
                        + (contact.get("emergencyPhone") == null ? "" : " · " + contact.get("emergencyPhone"));
        Student student = new Student(app.studentName(), app.studentCode(), app.gender().equals("F") ? "Female" : "Male",
                profile == null ? null : profile.cohort(),
                profile == null ? null : label("MAJOR", profile.major()),
                profile == null ? null : profile.hometown(), contact.get("phone"), emergency,
                profile == null ? null : profile.syncedAt());
        Names names = names();
        Billing.InvoiceLine deposit = billing.depositsOf(List.of(app.id())).get(app.id());
        List<Activity> activity = jdbc.sql("""
                SELECT text, note, at FROM app_application_event WHERE application_id = :app ORDER BY at, id
                """).param("app", app.id())
                .query((rs, i) -> new Activity(rs.getString("note") == null ? rs.getString("text")
                        : rs.getString("text") + " · " + rs.getString("note"), rs.getTimestamp("at").toInstant()))
                .list();
        return new ReviewDetail(app.code(), ApplicationStore.label(app.status()), term.name(), student,
                names.type(app.roomTypeId()), names.roomClass(app.roomClassId()), plain(app.surchargeRate()),
                app.termPrice(), roommate(app),
                eligibility.reviewChecks(app.studentId(), term, app.id()).stream()
                        .map(c -> new Check(c.title(), c.passed())).toList(),
                deposit == null ? null
                        : new Deposit(deposit.code(), deposit.amount(), deposit.method(), deposit.paidAt(), deposit.status()),
                activity);
    }

    // ---------------------------------------------------------------- decision

    /** @param decision {@code Approved} or {@code Rejected}; a rejection needs a note the student sees */
    @Transactional
    public void review(String idOrCode, String decision, String note) {
        AuthenticatedUser user = currentUser.require(Permission.REVIEW_APPLICATIONS);
        String code = decisionCode(decision);
        String text = note == null || note.isBlank() ? null : note.trim();
        if (code.equals("REJECTED") && text == null) {
            throw FieldErrors.single("note", "Add a note before rejecting. The student sees this note.");
        }
        ApplicationStore.Application app = inScope(idOrCode);
        app = applications.find(app.id(), true).orElseThrow();
        if (!REVIEWABLE.contains(app.status())) {
            throw ApiException.conflict("ALREADY_DECIDED", "Application " + app.code() + " is "
                    + ApplicationStore.label(app.status()).toLowerCase(Locale.ROOT) + " and cannot be reviewed now.");
        }
        decide(app, code, text, user);
    }

    /** Approves the reviewable Applications in scope; others are skipped. Rejections need a note each. */
    @Transactional
    public BulkResult bulkReview(List<String> ids, String decision) {
        AuthenticatedUser user = currentUser.require(Permission.REVIEW_APPLICATIONS);
        if (!decisionCode(decision).equals("APPROVED")) {
            throw FieldErrors.single("decision", "Reject Applications one at a time, with a note for the student.");
        }
        Set<String> genders = genders(null);
        int approved = 0;
        int skipped = 0;
        for (String id : ids) {
            Optional<ApplicationStore.Application> app = applications.find(id)
                    .flatMap(a -> applications.find(a.id(), true))
                    .filter(a -> genders.contains(a.gender()) && REVIEWABLE.contains(a.status()));
            if (app.isPresent()) {
                decide(app.get(), "APPROVED", null, user);
                approved++;
            } else {
                skipped++;
            }
        }
        return new BulkResult(approved, skipped);
    }

    private void decide(ApplicationStore.Application app, String code, String note, AuthenticatedUser user) {
        Timestamp now = Timestamp.from(Instant.now(clock));
        jdbc.sql("""
                UPDATE app_application SET status = :status, reviewed_by = :by, reviewed_at = :now, decision_note = :note,
                       updated_at = :now, version = version + 1
                WHERE id = :id
                """)
                .param("status", code).param("by", user.userId()).param("now", now).param("note", note)
                .param("id", app.id()).update();
        TermSummary term = terms.findPublished(app.termId()).orElseThrow();
        if (code.equals("APPROVED")) {
            applications.event(app.id(), "APPROVED", "Approved by the dormitory office", note, user.userId());
            audit.record("APPLICATION_APPROVED", AuditLog.Tone.SUCCESS, "Application", app.id(), app.code(), null);
            return;
        }
        applications.event(app.id(), "REJECTED", "Not approved", note, user.userId());
        audit.record("APPLICATION_REJECTED", AuditLog.Tone.WARNING, "Application", app.id(), app.code(),
                Map.of("note", note));
        for (Billing.InvoiceLine invoice : billing.invoicesOfApplication(app.id())) {
            if (!billing.voidUnpaid(invoice.id(), "Application rejected") && billing.isPaid(invoice.id())) {
                billing.requestRefund(invoice.id(), "APPLICATION_CANCEL", app.id(),
                        "Application " + app.code() + " not approved", "CANCEL_BEFORE_RESULTS");
            }
        }
        lifecycle.cancelPendingInvitation(app.id());
        if (app.partnerApplicationId() != null) {
            applications.find(app.partnerApplicationId(), true)
                    .ifPresent(p -> lifecycle.dropRoommate(p, "Your roommate's Application was not approved"));
        }
        events.publishEvent(new ApplicationRejected(app.id(), app.code(), app.studentId(), term.name(), note));
    }

    // ---------------------------------------------------------------- helpers

    private ApplicationStore.Application inScope(String idOrCode) {
        ApplicationStore.Application app = applications.find(idOrCode)
                .filter(a -> !Set.of("DRAFT").contains(a.status()))
                .orElseThrow(() -> ApiException.notFound("This Application does not exist."));
        if (!genders(null).contains(app.gender())) {
            throw ApiException.forbidden("BLOCK_OUT_OF_SCOPE", "This Application belongs to a Block you do not manage.");
        }
        return app;
    }

    /** Genders of the Blocks the user picked (or may see). */
    private Set<String> genders(String block) {
        return buildings.gendersOf(blockScope.resolve(block).ids());
    }

    private TermSummary term(Long termId) {
        if (termId != null) {
            return terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        }
        return terms.openForRegistration()
                .or(() -> terms.publishedTerms().stream().filter(TermSummary::current).findFirst())
                .orElseThrow(() -> ApiException.notFound("No Term is published yet."));
    }

    private static String decisionCode(String decision) {
        if ("approved".equalsIgnoreCase(decision == null ? "" : decision.trim())) {
            return "APPROVED";
        }
        if ("rejected".equalsIgnoreCase(decision == null ? "" : decision.trim())) {
            return "REJECTED";
        }
        throw FieldErrors.single("decision", "Choose Approved or Rejected.");
    }

    /** {@code Submitted,Under Review} → {@code [SUBMITTED, UNDER_REVIEW]}. */
    private static List<String> statusCodes(String labels) {
        List<String> codes = new ArrayList<>();
        for (String label : labels.split(",")) {
            String code = label.trim().toUpperCase(Locale.ROOT).replace(' ', '_');
            if (ApplicationStore.label(code) == null) {
                throw ApiException.badRequest("BAD_PARAMETER", "Unknown status " + label.trim() + ".");
            }
            codes.add(code);
        }
        return codes;
    }

    private Roommate roommate(ApplicationStore.Application app) {
        if (!app.roommateMode().equals("INVITE")) {
            return null;
        }
        Optional<String> partnerCode = app.partnerApplicationId() == null ? Optional.empty()
                : applications.find(app.partnerApplicationId(), false).map(ApplicationStore.Application::studentCode);
        String status = jdbc.sql("""
                SELECT status FROM app_roommate_invitation
                WHERE inviter_application_id = :app OR invitee_application_id = :app ORDER BY created_at DESC LIMIT 1
                """).param("app", app.id()).query(String.class).optional()
                .map(s -> s.charAt(0) + s.substring(1).toLowerCase(Locale.ROOT)).orElse(null);
        if (partnerCode.isEmpty()) {
            partnerCode = jdbc.sql("""
                    SELECT invitee_student_id FROM app_roommate_invitation WHERE inviter_application_id = :app
                    ORDER BY created_at DESC LIMIT 1
                    """).param("app", app.id()).query(Long.class).optional()
                    .flatMap(users::studentProfile).map(UserDirectory.StudentProfile::studentCode);
        }
        return new Roommate("invite", partnerCode.orElse(null), status);
    }

    private record Names(Map<Long, String> types, Map<Long, String> classes) {

        String type(long id) {
            return types.get(id);
        }

        String roomClass(long id) {
            return classes.get(id);
        }
    }

    private Names names() {
        return new Names(
                catalog.roomTypes().stream().collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name)),
                catalog.roomClasses().stream()
                        .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name)));
    }

    private String label(String list, String code) {
        return code == null ? null : lookups.find(list, code).map(Lookups.Lookup::label).orElse(code);
    }

    private static BigDecimal plain(BigDecimal value) {
        return value == null ? null : new BigDecimal(value.stripTrailingZeros().toPlainString());
    }
}
