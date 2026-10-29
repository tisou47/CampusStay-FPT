package vn.fpt.campusstay.service.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.application.Round2Placements;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.WaitlistEnded;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.repository.application.ApplicationStore;

/**
 * Round-2 offers to Waitlisted students: pick one of the held Beds (the
 * Application is Allocated and the Balance issued) or decline. A declined or
 * unanswered offer cancels the Application; its paid Deposit is refunded
 * once a Manager approves.
 */
@Service
public class Round2Service {

    public record OfferApplication(String id, String roomTypeName, String roomClassName, long termPrice,
            long depositPaid) {
    }

    /** @param fill share of the Room already taken, e.g. {@code 50%} */
    public record OfferOption(String id, String roomTypeName, String roomClassName, String block, String note,
            String fill, long termPrice, long difference) {
    }

    public record Offer(String id, Instant expiresAt, String termName, OfferApplication application,
            List<OfferOption> options) {
    }

    public record MyOffer(Offer offer) {
    }

    public record Responded(String balanceInvoiceId) {
    }

    /** @param refund the Deposit paid, refunded in full after a Manager approves (VND) */
    public record Withdrawn(String applicationId, long refund) {
    }

    private record OfferRow(long id, long applicationId, Instant expiresAt) {
    }

    private record OptionRow(long id, long roomTypeId, long roomClassId, long buildingId, long bedId, String note,
            BigDecimal fillRate, long termPrice, long difference) {
    }

    private final JdbcClient jdbc;
    private final ApplicationStore applications;
    private final CurrentUser currentUser;
    private final TermCatalog terms;
    private final Catalog catalog;
    private final BlockDirectory blocks;
    private final Billing billing;
    private final Round2Placements placements;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public Round2Service(JdbcClient jdbc, ApplicationStore applications, CurrentUser currentUser, TermCatalog terms,
            Catalog catalog, BlockDirectory blocks, Billing billing, Round2Placements placements,
            ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.applications = applications;
        this.currentUser = currentUser;
        this.terms = terms;
        this.catalog = catalog;
        this.blocks = blocks;
        this.billing = billing;
        this.placements = placements;
        this.events = events;
        this.clock = clock;
    }

    /** The student's open offer, or {@code offer: null}. */
    @Transactional(readOnly = true)
    public MyOffer mine() {
        long me = currentUser.require(Role.STUDENT).userId();
        Optional<OfferRow> row = jdbc.sql("""
                SELECT f.id, f.application_id, f.expires_at FROM app_round2_offer f
                JOIN app_application a ON a.id = f.application_id
                WHERE a.student_id = :me AND f.status = 'PENDING' AND f.expires_at > :now
                ORDER BY f.created_at DESC LIMIT 1
                """).param("me", me).param("now", Timestamp.from(Instant.now(clock)))
                .query((rs, i) -> new OfferRow(rs.getLong("id"), rs.getLong("application_id"),
                        rs.getTimestamp("expires_at").toInstant()))
                .optional();
        if (row.isEmpty()) {
            return new MyOffer(null);
        }
        OfferRow offer = row.get();
        ApplicationStore.Application app = applications.find(offer.applicationId(), false).orElseThrow();
        Map<Long, String> types = catalog.roomTypes().stream()
                .collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name));
        Map<Long, String> classes = catalog.roomClasses().stream()
                .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name));
        List<OptionRow> options = options(offer.id());
        Map<Long, String> codes = blocks.codesByIds(Set.copyOf(options.stream().map(OptionRow::buildingId).toList()));
        return new MyOffer(new Offer(String.valueOf(offer.id()), offer.expiresAt(),
                terms.findPublished(app.termId()).map(TermSummary::name).orElse(null),
                new OfferApplication(app.code(), types.get(app.roomTypeId()), classes.get(app.roomClassId()),
                        app.termPrice(), depositPaid(app.id())),
                options.stream().map(o -> new OfferOption(String.valueOf(o.id()), types.get(o.roomTypeId()),
                        classes.get(o.roomClassId()), codes.get(o.buildingId()), o.note(),
                        o.fillRate() == null ? null
                                : o.fillRate().movePointRight(2).setScale(0, RoundingMode.HALF_UP) + "%",
                        o.termPrice(), o.difference())).toList()));
    }

    @Transactional
    public Responded respond(String offerId, Boolean accept, String optionId) {
        if (accept == null) {
            throw FieldErrors.single("accept", "Accept an option or decline the offer.");
        }
        long me = currentUser.require(Role.STUDENT).userId();
        OfferRow offer = parse(offerId).flatMap(id -> jdbc.sql("""
                SELECT f.id, f.application_id, f.expires_at, f.status FROM app_round2_offer f
                JOIN app_application a ON a.id = f.application_id
                WHERE f.id = :id AND a.student_id = :me FOR UPDATE OF f
                """).param("id", id).param("me", me)
                .query((rs, i) -> rs.getString("status").equals("PENDING")
                        ? new OfferRow(rs.getLong("id"), rs.getLong("application_id"),
                                rs.getTimestamp("expires_at").toInstant())
                        : new OfferRow(-1, rs.getLong("application_id"), null))
                .optional())
                .orElseThrow(() -> ApiException.notFound("This offer does not exist."));
        Instant now = Instant.now(clock);
        if (offer.id() < 0 || !offer.expiresAt().isAfter(now)) {
            throw ApiException.conflict("OFFER_CLOSED", "This offer is no longer open.");
        }
        if (!accept) {
            close(offer, "DECLINED", "Round 2 offer declined", now);
            return new Responded(null);
        }
        OptionRow option = parse(optionId).flatMap(id -> options(offer.id()).stream().filter(o -> o.id() == id).findFirst())
                .orElseThrow(() -> FieldErrors.single("optionId", "Choose one of the offered Rooms."));
        jdbc.sql("UPDATE app_round2_option SET held = FALSE, chosen = (id = :chosen) WHERE offer_id = :offer")
                .param("chosen", option.id()).param("offer", offer.id()).update();
        jdbc.sql("UPDATE app_round2_offer SET status = 'ACCEPTED', responded_at = :now, version = version + 1 WHERE id = :id")
                .param("now", Timestamp.from(now)).param("id", offer.id()).update();
        return new Responded(placements.place(offer.applicationId(), option.bedId(), option.termPrice()).orElse(null));
    }

    /** Offers past their time expire: the Beds are released and the Application is cancelled with a refund. */
    @Transactional
    public int expire() {
        Instant now = Instant.now(clock);
        List<OfferRow> due = jdbc.sql("""
                SELECT id, application_id, expires_at FROM app_round2_offer
                WHERE status = 'PENDING' AND expires_at <= :now FOR UPDATE SKIP LOCKED
                """).param("now", Timestamp.from(now))
                .query((rs, i) -> new OfferRow(rs.getLong("id"), rs.getLong("application_id"),
                        rs.getTimestamp("expires_at").toInstant()))
                .list();
        due.forEach(o -> close(o, "EXPIRED", "Round 2 offer expired", now));
        return due.size();
    }

    private void close(OfferRow offer, String status, String text, Instant now) {
        jdbc.sql("UPDATE app_round2_option SET held = FALSE WHERE offer_id = :offer").param("offer", offer.id()).update();
        jdbc.sql("UPDATE app_round2_offer SET status = :status, responded_at = :now, version = version + 1 WHERE id = :id")
                .param("status", status).param("now", Timestamp.from(now)).param("id", offer.id()).update();
        cancelWaitlisted(applications.find(offer.applicationId(), true).orElseThrow(), text);
    }

    /**
     * A waitlisted student who is not placed gets the whole Deposit back, whatever the cancellation rules say: the
     * dormitory had no Bed for them (user decision 29/10/2026). @return the refund, or -1 when the Application was
     * no longer waitlisted
     */
    private long cancelWaitlisted(ApplicationStore.Application app, String text) {
        if (!applications.transition(app.id(), Set.of("WAITLISTED"), "CANCELLED")) {
            return -1;
        }
        applications.event(app.id(), "CANCELLED", text, "The Application is cancelled; the Deposit is refunded "
                + "after a Manager approves.", null);
        long paid = depositPaid(app.id());
        if (paid > 0) {
            billing.requestCredit(app.termId(), app.studentId(), null, "APPLICATION_CANCEL", app.id(),
                    text + " · Application " + app.code(), paid);
        }
        return paid;
    }

    /**
     * The student leaves the waitlist (A-61): an open offer closes as declined and its Beds are released, the
     * Application is cancelled and the Deposit refunded in full after a Manager approves.
     */
    @Transactional
    public Withdrawn withdraw(String applicationId) {
        long me = currentUser.require(Role.STUDENT).userId();
        ApplicationStore.Application app = applications.find(applicationId == null ? "" : applicationId.trim())
                .filter(a -> a.studentId() == me)
                .flatMap(a -> applications.find(a.id(), true))
                .orElseThrow(() -> ApiException.notFound("This Application does not exist."));
        if (!app.status().equals("WAITLISTED")) {
            throw ApiException.conflict("NOT_WAITLISTED", "Only an Application on the waitlist can be withdrawn.");
        }
        String text = "Withdrawn from the waitlist";
        Optional<OfferRow> offer = jdbc.sql("""
                SELECT id, application_id, expires_at FROM app_round2_offer
                WHERE application_id = :app AND status = 'PENDING' FOR UPDATE
                """).param("app", app.id())
                .query((rs, i) -> new OfferRow(rs.getLong("id"), rs.getLong("application_id"),
                        rs.getTimestamp("expires_at").toInstant()))
                .optional();
        long paid = depositPaid(app.id());
        if (offer.isPresent()) {
            close(offer.get(), "DECLINED", text, Instant.now(clock));
        } else {
            cancelWaitlisted(app, text);
        }
        return new Withdrawn(app.code(), paid);
    }

    /**
     * The waitlist of a Term ends when its check-in starts (user decision 29/10/2026): Waitlisted Applications
     * without an open offer are cancelled with a full refund, and the students are told. An open offer still runs to
     * its answer or expiry. Terms whose stay is over are left alone. Idempotent.
     */
    @Transactional
    public int endWaitlists() {
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        int ended = 0;
        for (TermSummary term : terms.publishedTerms()) {
            if (term.checkInStart() == null || today.isBefore(term.checkInStart())
                    || (term.stayEnd() != null && today.isAfter(term.stayEnd()))) {
                continue;
            }
            List<Long> waiting = jdbc.sql("""
                    SELECT a.id FROM app_application a
                    WHERE a.term_id = :term AND a.status = 'WAITLISTED'
                      AND NOT EXISTS (SELECT 1 FROM app_round2_offer f
                                      WHERE f.application_id = a.id AND f.status = 'PENDING')
                    ORDER BY a.id FOR UPDATE SKIP LOCKED
                    """).param("term", term.id()).query(Long.class).list();
            for (long id : waiting) {
                ApplicationStore.Application app = applications.find(id, true).orElseThrow();
                long refund = cancelWaitlisted(app, "No Bed was found before check-in");
                if (refund >= 0) {
                    ended++;
                    events.publishEvent(new WaitlistEnded(app.id(), app.code(), app.studentId(), term.name(), refund));
                }
            }
        }
        return ended;
    }

    private long depositPaid(long applicationId) {
        return billing.invoicesOfApplication(applicationId).stream()
                .filter(i -> i.type().equals("deposit") && i.status().equals("Paid"))
                .mapToLong(Billing.InvoiceLine::amount).sum();
    }

    private List<OptionRow> options(long offerId) {
        return jdbc.sql("SELECT * FROM app_round2_option WHERE offer_id = :offer ORDER BY abs(difference), id")
                .param("offer", offerId)
                .query((rs, i) -> new OptionRow(rs.getLong("id"), rs.getLong("room_type_id"), rs.getLong("room_class_id"),
                        rs.getLong("building_id"), rs.getLong("bed_id"), rs.getString("note"),
                        rs.getBigDecimal("fill_rate"), rs.getLong("term_price"), rs.getLong("difference")))
                .list();
    }

    private static Optional<Long> parse(String value) {
        if (value == null || value.isBlank() || value.length() > 18 || !value.trim().chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(value.trim()));
    }
}
