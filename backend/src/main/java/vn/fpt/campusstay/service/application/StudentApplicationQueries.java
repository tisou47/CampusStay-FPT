package vn.fpt.campusstay.service.application;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.service.application.StudentAllocations;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.setting.Lookups;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.repository.application.ApplicationStore;

/**
 * Student screens over Applications: Home, profile, My Applications, Application
 * detail and the roommate invitation. A student only ever sees their own
 * Applications; another student's code answers 404.
 */
@Service
public class StudentApplicationQueries {

    public record HomeApplication(String id, String status, String roomTypeName, String roomClassName) {
    }

    public record HomeAllocation(String room, String bed, String block, String floor) {
    }

    public record DueInvoice(String id, String type, String title, long amount, Instant dueAt) {
    }

    public record InvoiceCount(long due, long total) {
    }

    /** {@code allocation} and {@code checkedIn} are filled from S3/S4; {@code openRequests} from S4. */
    public record Home(String firstName, TermView term, HomeApplication application, HomeAllocation allocation,
            boolean checkedIn, DueInvoice dueInvoice, InvoiceCount invoices, long openRequests) {
    }

    public record ProfileContact(String phone, String email, String emergencyName, String relationship,
            String emergencyPhone) {
    }

    public record Profile(String name, String studentCode, String gender, String major, String cohort, String hometown,
            ProfileContact contact) {
    }

    /** @param stayTerms stay length: the Terms the student wants to stay */
    public record ApplicationItem(String id, String termName, String roomTypeName, String roomClassName, Long deposit,
            Instant submittedAt, String status, int stayTerms) {
    }

    public record ApplicationPage(List<ApplicationItem> items, long total, String activeTermName) {
    }

    public record Preferences(String region, String semester, String major) {
    }

    public record RoommateView(String mode, String studentCode, String status, Preferences preferences) {
    }

    public record Event(String title, Instant at, String state, String note) {
    }

    public record InvoiceView(String id, String type, String title, long amount, String status, Instant dueAt,
            Instant paidAt) {
    }

    public record ApplicationDetail(String id, String status, String termName, String roomTypeName,
            String roomClassName, BigDecimal surchargeRate, boolean twoBed, RoommateView roommate,
            HomeAllocation allocation, List<Event> events, List<InvoiceView> invoices, boolean canCancel,
            String cancelPolicy, Instant resultsPublishedAt, Instant registrationClosesAt, String decisionNote,
            int stayTerms, Waitlist waitlist) {
    }

    /** The open Round-2 offer: answer it before {@code expiresAt} on the offer page. */
    public record OfferRef(String id, Instant expiresAt, int options) {
    }

    /**
     * A waitlisted Application (A-61): the open offer, if any; {@code until} the day the waitlist ends (the Term's
     * first check-in day); {@code refund} the Deposit paid, refunded in full when the student is not placed.
     */
    public record Waitlist(OfferRef offer, LocalDate until, long refund) {
    }

    public record Invitation(String id, String fromName, Instant expiresAt, String termName,
            LocalDate stayStart, LocalDate stayEnd, String roomTypeName, String roomClassName,
            BigDecimal surchargeRate, long termPrice, long deposit, int depositWindowHours,
            Instant registrationClosesAt) {
    }

    public record InvitationView(Invitation invitation) {
    }

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy")
            .withZone(TimeConfig.CAMPUS_ZONE);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final JdbcClient jdbc;
    private final ApplicationStore applications;
    private final ApplicationService service;
    private final CurrentUser currentUser;
    private final UserDirectory users;
    private final TermCatalog terms;
    private final Catalog catalog;
    private final FeePolicy fees;
    private final Lookups lookups;
    private final Billing billing;
    private final StudentAllocations allocations;
    private final JsonMapper json;
    private final Clock clock;

    public StudentApplicationQueries(JdbcClient jdbc, ApplicationStore applications, ApplicationService service,
            CurrentUser currentUser, UserDirectory users, TermCatalog terms, Catalog catalog, FeePolicy fees,
            Lookups lookups, Billing billing, StudentAllocations allocations, JsonMapper json, Clock clock) {
        this.allocations = allocations;
        this.jdbc = jdbc;
        this.applications = applications;
        this.service = service;
        this.currentUser = currentUser;
        this.users = users;
        this.terms = terms;
        this.catalog = catalog;
        this.fees = fees;
        this.lookups = lookups;
        this.billing = billing;
        this.json = json;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- Home

    /**
     * @param termId the Term the app shows (for a student {@code GET /terms} marks their own Term as
     *               current); null = the Term of their live Application, else the one open for registration
     */
    @Transactional(readOnly = true)
    public Home home(Long termId) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        List<TermSummary> published = terms.publishedTerms();
        TermSummary term = termId != null
                ? published.stream().filter(t -> t.id() == termId).findFirst()
                        .orElseThrow(() -> ApiException.notFound("This Term does not exist."))
                : focus(me.userId(), published);
        Optional<ApplicationStore.Application> app = term == null ? Optional.empty()
                : applications.ofStudent(me.userId()).stream().filter(a -> a.termId() == term.id())
                        .min(Comparator.comparing((ApplicationStore.Application a) -> !a.live())
                                .thenComparing(ApplicationStore.Application::createdAt, Comparator.reverseOrder()));
        Names names = names();
        DueInvoice due = null;
        InvoiceCount count = new InvoiceCount(0, 0);
        if (term != null) {
            Billing.DueSummary summary = billing.dueSummary(me.userId(), term.id());
            count = new InvoiceCount(summary.due(), summary.total());
            due = summary.next().map(i -> new DueInvoice(i.code(), i.type(), i.title(), i.amount(), i.dueAt()))
                    .orElse(null);
        }
        Optional<StudentAllocations.Placement> placement = app.flatMap(a -> allocations.ofApplication(a.id()));
        String[] words = me.name().trim().split("\\s+");
        return new Home(words[words.length - 1], TermView.of(term),
                app.map(a -> new HomeApplication(a.code(), ApplicationStore.label(a.status()), names.type(a.roomTypeId()),
                        names.roomClass(a.roomClassId()))).orElse(null),
                placement.map(p -> new HomeAllocation(p.room(), p.bed(), "Block " + p.block(), "Floor " + p.floor()))
                        .orElse(null),
                placement.map(p -> p.residentAt() != null).orElse(false), due, count, 0);
    }

    /** The Term of a live Application that has not ended, else the one open for registration, else current. */
    private TermSummary focus(long studentId, List<TermSummary> published) {
        Map<Long, TermSummary> byId = published.stream().collect(Collectors.toMap(TermSummary::id, Function.identity()));
        Instant now = Instant.now(clock);
        LocalDate today = LocalDate.ofInstant(now, TimeConfig.CAMPUS_ZONE);
        return applications.ofStudent(studentId).stream()
                .filter(ApplicationStore.Application::live)
                .map(a -> byId.get(a.termId()))
                .filter(t -> t != null && !today.isAfter(t.stayEnd()))
                .findFirst()
                .or(() -> published.stream().filter(TermSummary::registrationOpen).findFirst())
                .or(() -> published.stream().filter(TermSummary::current).findFirst())
                .orElse(null);
    }

    // ---------------------------------------------------------------- profile

    @Transactional(readOnly = true)
    public Profile profile() {
        long me = currentUser.require(Role.STUDENT).userId();
        UserDirectory.StudentProfile p = users.studentProfile(me)
                .orElseThrow(() -> ApiException.notFound("Your student record was not found."));
        String email = applications.ofStudent(me).stream()
                .map(a -> contactOf(a).get("email")).filter(e -> e != null && !e.isBlank()).findFirst().orElse(null);
        return new Profile(p.name(), p.studentCode(), p.gender().equals("F") ? "Female" : "Male",
                label("MAJOR", p.major()), p.cohort(), p.hometown(),
                new ProfileContact(p.phone(), email, p.emergencyName(), label("RELATIONSHIP", p.emergencyRelationship()),
                        p.emergencyPhone()));
    }

    // ---------------------------------------------------------------- My Applications

    @Transactional(readOnly = true)
    public ApplicationPage mine(PageQuery page) {
        long me = currentUser.require(Role.STUDENT).userId();
        List<ApplicationStore.Application> all = applications.ofStudent(me);
        Map<Long, TermSummary> termsById = termsById();
        Names names = names();
        List<ApplicationItem> items = all.stream().skip(page.offset()).limit(page.limit())
                .map(a -> new ApplicationItem(a.code(), termName(termsById, a.termId()), names.type(a.roomTypeId()),
                        names.roomClass(a.roomClassId()), a.depositAmount(), a.submittedAt(),
                        ApplicationStore.label(a.status()), a.stayTerms()))
                .toList();
        String active = terms.openForRegistration()
                .filter(t -> all.stream().anyMatch(a -> a.termId() == t.id() && a.live()))
                .map(TermSummary::name).orElse(null);
        return new ApplicationPage(items, all.size(), active);
    }

    // ---------------------------------------------------------------- Application detail (student view)

    @Transactional(readOnly = true)
    public ApplicationDetail detail(String idOrCode) {
        AuthenticatedUser me = currentUser.get();
        if (!me.is(Role.STUDENT)) {
            throw ApiException.notFound("This Application does not exist.");
        }
        ApplicationStore.Application app = applications.find(idOrCode).filter(a -> a.studentId() == me.userId())
                .orElseThrow(() -> ApiException.notFound("This Application does not exist."));
        TermSummary term = terms.findPublished(app.termId()).orElseThrow();
        Names names = names();
        Catalog.RoomTypeInfo type = names.types.get(app.roomTypeId());
        boolean twoBed = type != null && type.beds() == 2;
        List<InvoiceView> invoices = billing.invoicesOfApplication(app.id()).stream()
                .map(i -> new InvoiceView(i.code(), i.type(), i.title(), i.amount(), i.status(), i.dueAt(), i.paidAt()))
                .toList();
        boolean canCancel = service.canCancel(app, term);
        return new ApplicationDetail(app.code(), ApplicationStore.label(app.status()), term.name(),
                names.type(app.roomTypeId()), names.roomClass(app.roomClassId()),
                plain(app.surchargeRate()),
                twoBed, twoBed ? roommate(app) : null,
                allocations.ofApplication(app.id())
                        .map(p -> new HomeAllocation(p.room(), p.bed(), "Block " + p.block(), "Floor " + p.floor()))
                        .orElse(null),
                events(app, term), invoices, canCancel,
                cancelPolicy(term), term.resultsPublishedAt(), term.registrationClosesAt(), app.decisionNote(),
                app.stayTerms(), app.status().equals("WAITLISTED") ? waitlist(app, term) : null);
    }

    private Waitlist waitlist(ApplicationStore.Application app, TermSummary term) {
        OfferRef offer = openOffer(app.id()).orElse(null);
        long refund = billing.invoicesOfApplication(app.id()).stream()
                .filter(i -> i.type().equals("deposit") && i.status().equals("Paid"))
                .mapToLong(Billing.InvoiceLine::amount).sum();
        return new Waitlist(offer, term.checkInStart(), refund);
    }

    private Optional<OfferRef> openOffer(long applicationId) {
        return jdbc.sql("""
                SELECT f.id, f.expires_at, (SELECT count(*) FROM app_round2_option o WHERE o.offer_id = f.id) AS options
                FROM app_round2_offer f WHERE f.application_id = :app AND f.status = 'PENDING' AND f.expires_at > :now
                ORDER BY f.created_at DESC LIMIT 1
                """).param("app", applicationId).param("now", Timestamp.from(Instant.now(clock)))
                .query((rs, i) -> new OfferRef(String.valueOf(rs.getLong("id")), rs.getTimestamp("expires_at").toInstant(),
                        rs.getInt("options")))
                .optional();
    }

    private RoommateView roommate(ApplicationStore.Application app) {
        if (app.roommateMode().equals("INVITE")) {
            record Invite(String status, long inviteeId, long inviterApplicationId) {
            }
            Optional<Invite> invite = jdbc.sql("""
                    SELECT status, invitee_student_id, inviter_application_id FROM app_roommate_invitation
                    WHERE inviter_application_id = :app OR invitee_application_id = :app
                    ORDER BY created_at DESC LIMIT 1
                    """).param("app", app.id())
                    .query((rs, i) -> new Invite(rs.getString("status"), rs.getLong("invitee_student_id"),
                            rs.getLong("inviter_application_id")))
                    .optional();
            String partnerCode = invite.map(i -> i.inviterApplicationId() == app.id()
                    ? users.studentProfile(i.inviteeId()).map(UserDirectory.StudentProfile::studentCode).orElse(null)
                    : applications.find(i.inviterApplicationId(), false)
                            .flatMap(a -> users.studentProfile(a.studentId()))
                            .map(UserDirectory.StudentProfile::studentCode).orElse(null))
                    .orElse(null);
            String status = invite.map(i -> switch (i.status()) {
                case "PENDING" -> "Pending";
                case "ACCEPTED" -> "Accepted";
                case "DECLINED" -> "Declined";
                case "EXPIRED" -> "Expired";
                default -> "Cancelled";
            }).orElse(null);
            return new RoommateView("invite", partnerCode, status, null);
        }
        Preferences preferences = null;
        if (app.preferences() != null) {
            Map<String, String> codes = json.readValue(app.preferences(), new TypeReference<Map<String, String>>() {
            });
            preferences = new Preferences(label("REGION", codes.get("region")), label("SEMESTER", codes.get("semester")),
                    label("MAJOR", codes.get("major")));
        }
        return new RoommateView("auto", null, null, preferences);
    }

    /** What happened (done), then what comes next: the first upcoming step is current. */
    private List<Event> events(ApplicationStore.Application app, TermSummary term) {
        List<Event> events = new ArrayList<>(jdbc.sql("""
                SELECT text, at, note FROM app_application_event
                WHERE application_id = :app AND visible_to_student ORDER BY at, id
                """).param("app", app.id())
                .query((rs, i) -> new Event(rs.getString("text"), rs.getTimestamp("at").toInstant(), "done",
                        rs.getString("note")))
                .list());
        List<String[]> next = switch (app.status()) {
            case "AWAITING_DEPOSIT" -> List.of(
                    new String[] { "Pay the Deposit",
                            app.depositDueAt() == null ? null : "By " + WHEN.format(app.depositDueAt()) },
                    new String[] { "Review by the dormitory office", "After registration closes on "
                            + DAY.format(term.registrationClosesAt()) },
                    new String[] { "Assignment results", DAY.format(term.resultsPublishedAt()) });
            case "AWAITING_ROOMMATE" -> List.of(
                    new String[] { "Your roommate pays their Deposit", null },
                    new String[] { "Review by the dormitory office", null },
                    new String[] { "Assignment results", DAY.format(term.resultsPublishedAt()) });
            case "SUBMITTED", "UNDER_REVIEW" -> List.of(
                    new String[] { "Review by the dormitory office", null },
                    new String[] { "Assignment results", DAY.format(term.resultsPublishedAt()) });
            case "APPROVED" -> List.<String[]>of(
                    new String[] { "Assignment results", DAY.format(term.resultsPublishedAt()) });
            // Waitlisted: choose a Round-2 option or wait; the waitlist ends when check-in starts (A-61).
            case "WAITLISTED" -> {
                Optional<OfferRef> offer = openOffer(app.id());
                String until = term.checkInStart() == null ? null : term.checkInStart().format(DATE);
                yield List.<String[]>of(
                        offer.isPresent()
                                ? new String[] { "Choose a Room from the Round 2 options",
                                        "By " + WHEN.format(offer.get().expiresAt()) }
                                : new String[] { "Wait for a free Bed", until == null ? null : "Until " + until },
                        new String[] { "Waitlist ends: not placed, Deposit refunded in full", until });
            }
            default -> List.of();
        };
        for (int i = 0; i < next.size(); i++) {
            events.add(new Event(next.get(i)[0], null, i == 0 ? "current" : "upcoming", next.get(i)[1]));
        }
        return events;
    }

    private String cancelPolicy(TermSummary term) {
        Instant deadline = service.cancelDeadline(term);
        String refund = fees.refundRule("CANCEL_BEFORE_RESULTS")
                .map(r -> " A paid Deposit is refunded " + r.refundPercent() + "% ("
                        + r.description().toLowerCase(Locale.ROOT) + ").")
                .orElse("");
        return "You can cancel until " + WHEN.format(deadline) + "." + refund;
    }

    // ---------------------------------------------------------------- roommate invitation

    @Transactional(readOnly = true)
    public InvitationView invitation() {
        long me = currentUser.require(Role.STUDENT).userId();
        record Row(long id, long inviterApplicationId, Instant expiresAt) {
        }
        Optional<Row> row = jdbc.sql("""
                SELECT id, inviter_application_id, expires_at FROM app_roommate_invitation
                WHERE invitee_student_id = :me AND status = 'PENDING' AND expires_at > :now
                ORDER BY created_at DESC LIMIT 1
                """).param("me", me).param("now", Timestamp.from(Instant.now(clock)))
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getLong("inviter_application_id"),
                        rs.getTimestamp("expires_at").toInstant()))
                .optional();
        if (row.isEmpty()) {
            return new InvitationView(null);
        }
        ApplicationStore.Application inviter = applications.find(row.get().inviterApplicationId(), false).orElseThrow();
        TermSummary term = terms.findPublished(inviter.termId()).orElseThrow();
        Names names = names();
        String fromName = users.displayNames(List.of(inviter.studentId())).get(inviter.studentId());
        return new InvitationView(new Invitation(String.valueOf(row.get().id()), fromName, row.get().expiresAt(),
                term.name(), term.stayStart(), term.stayEnd(), names.type(inviter.roomTypeId()),
                names.roomClass(inviter.roomClassId()),
                plain(inviter.surchargeRate()), inviter.termPrice(),
                inviter.depositAmount(), term.depositWindowHours(), term.registrationClosesAt()));
    }

    // ---------------------------------------------------------------- helpers

    private record Names(Map<Long, Catalog.RoomTypeInfo> types, Map<Long, Catalog.RoomClassInfo> classes) {

        String type(long id) {
            Catalog.RoomTypeInfo t = types.get(id);
            return t == null ? null : t.name();
        }

        String roomClass(long id) {
            Catalog.RoomClassInfo c = classes.get(id);
            return c == null ? null : c.name();
        }
    }

    private Names names() {
        return new Names(
                catalog.roomTypes().stream().collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Function.identity())),
                catalog.roomClasses().stream().collect(Collectors.toMap(Catalog.RoomClassInfo::id, Function.identity())));
    }

    private Map<Long, TermSummary> termsById() {
        return terms.publishedTerms().stream().collect(Collectors.toMap(TermSummary::id, Function.identity()));
    }

    private static String termName(Map<Long, TermSummary> terms, long id) {
        TermSummary t = terms.get(id);
        return t == null ? null : t.name();
    }

    private Map<String, String> contactOf(ApplicationStore.Application app) {
        return json.readValue(app.contact(), new TypeReference<Map<String, String>>() {
        });
    }

    /** {@code 0.1500} → {@code 0.15} (rates as the contract shows them). */
    private static BigDecimal plain(BigDecimal value) {
        return value == null ? null : new BigDecimal(value.stripTrailingZeros().toPlainString());
    }

    private String label(String list, String code) {
        return code == null ? null : lookups.find(list, code).map(Lookups.Lookup::label).orElse(code);
    }
}
