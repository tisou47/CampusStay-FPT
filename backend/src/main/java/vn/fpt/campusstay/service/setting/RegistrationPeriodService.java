package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;

/**
 * What students read about a registration period (spec §6.5): the card at the top of the dormitory board and the
 * Registration period details (Timeline, Prices with the places and furniture of each line, House rules, FAQ). Every
 * signed-in role may read them; only published Terms exist here. Students never see the Rooms: a line's places are
 * the Beds of their gender (R-09).
 */
@Service
public class RegistrationPeriodService {

    /**
     * The card on the board.
     *
     * @param status      Opens soon, Open or Closed
     * @param countdownTo when the status changes next: registration opens (Opens soon) or closes (Open); null when
     *                    closed
     * @param places      Beds the Term offers
     * @param fromPrice   the lowest price per Bed
     */
    public record Card(String termId, String name, String status, Instant opensAt, Instant closesAt,
            Instant countdownTo, LocalDate stayStart, LocalDate stayEnd, int places, Long fromPrice) {
    }

    /** {@code card}: null when no published Term is coming or open. */
    public record Current(Card card) {
    }

    /** One line of the timeline; {@code at} for a moment, {@code date}/{@code until} for days. */
    public record Milestone(String key, String label, Instant at, LocalDate date, LocalDate until, boolean done) {
    }

    public record Price(String roomTypeId, String roomType, int beds, String roomClassId, String roomClass,
            long price, long deposit) {
    }

    /**
     * One price line of the details.
     *
     * @param places    Beds the Term offers on this line: of the reader's gender for a student, every Bed otherwise
     * @param furniture what a Room of the class must have (Admin › Room Classes)
     */
    public record PriceLine(String roomTypeId, String roomType, int beds, String roomClassId, String roomClass,
            long price, long deposit, int places, List<TermSupply.Furniture> furniture) {
    }

    public record Details(String id, String name, String status, LocalDate stayStart, LocalDate stayEnd,
            List<Milestone> timeline, List<PriceLine> prices, BigDecimal depositPercent, long utilityDeposit,
            String houseRules, List<TermPlan.Faq> faq, List<TermPlan.Document> documents) {
    }

    private final TermCatalog terms;
    private final TermDrafts drafts;
    private final TermSupply supply;
    private final FeePolicy fees;
    private final Catalog catalog;
    private final CurrentUser currentUser;
    private final UserDirectory users;
    private final Clock clock;

    public RegistrationPeriodService(TermCatalog terms, TermDrafts drafts, TermSupply supply, FeePolicy fees,
            Catalog catalog, CurrentUser currentUser, UserDirectory users, Clock clock) {
        this.terms = terms;
        this.drafts = drafts;
        this.supply = supply;
        this.fees = fees;
        this.catalog = catalog;
        this.currentUser = currentUser;
        this.users = users;
        this.clock = clock;
    }

    /** The Term open for registration; else the next one to open; else the latest one whose stay has not ended. */
    @Transactional(readOnly = true)
    public Current current() {
        Instant now = Instant.now(clock);
        LocalDate today = LocalDate.ofInstant(now, TimeConfig.CAMPUS_ZONE);
        List<TermSummary> published = terms.publishedTerms();
        Optional<TermSummary> pick = published.stream().filter(TermSummary::registrationOpen).findFirst()
                .or(() -> published.stream().filter(t -> t.registrationOpensAt().isAfter(now))
                        .min(Comparator.comparing(TermSummary::registrationOpensAt)))
                .or(() -> published.stream().filter(t -> !today.isAfter(t.stayEnd()))
                        .max(Comparator.comparing(TermSummary::registrationClosesAt)));
        if (pick.isEmpty()) {
            return new Current(null);
        }
        TermSummary t = pick.get();
        String status = t.registrationOpen() ? "Open" : t.registrationOpensAt().isAfter(now) ? "Opens soon" : "Closed";
        Instant countdown = switch (status) {
            case "Open" -> t.registrationClosesAt();
            case "Opens soon" -> t.registrationOpensAt();
            default -> null;
        };
        int places = supply.supply(t.id(), terms.rooms(t.id())).stream().mapToInt(TermSupply.Row::beds).sum();
        Long fromPrice = prices(t.id()).stream().map(Price::price).min(Long::compare).orElse(null);
        return new Current(new Card(String.valueOf(t.id()), t.name(), status, t.registrationOpensAt(),
                t.registrationClosesAt(), countdown, t.stayStart(), t.stayEnd(), places, fromPrice));
    }

    @Transactional(readOnly = true)
    public Details details(long termId) {
        TermSummary summary = terms.findPublished(termId)
                .orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        TermDrafts.Term t = drafts.get(termId);
        Instant now = Instant.now(clock);
        LocalDate today = LocalDate.ofInstant(now, TimeConfig.CAMPUS_ZONE);
        TermPlan.Timeline v = t.timeline();
        List<Milestone> timeline = new ArrayList<>();
        moment(timeline, "registrationOpensAt", v.registrationOpensAt(), now);
        moment(timeline, "registrationClosesAt", v.registrationClosesAt(), now);
        moment(timeline, "resultsPublishedAt", v.resultsPublishedAt(), now);
        moment(timeline, "balanceDueAt", v.balanceDueAt(), now);
        if (v.checkInStart() != null) {
            timeline.add(new Milestone("checkIn", "Check-in", null, v.checkInStart(), v.checkInEnd(),
                    v.checkInEnd() != null && today.isAfter(v.checkInEnd())));
        }
        timeline.add(new Milestone("stay", "Stay", null, t.stayStart(), t.stayEnd(), today.isAfter(t.stayEnd())));
        if (v.checkOutBy() != null) {
            timeline.add(new Milestone("checkOutBy", TermDrafts.LABELS.get("checkOutBy"), null, v.checkOutBy(), null,
                    today.isAfter(v.checkOutBy())));
        }
        AuthenticatedUser me = currentUser.get();
        String gender = me.role() == Role.STUDENT
                ? users.studentProfile(me.userId()).map(UserDirectory.StudentProfile::gender).orElse("") : null;
        Map<String, Integer> places = new HashMap<>();
        for (TermSupply.Row r : supply.supply(termId, terms.rooms(termId))) {
            if (gender == null || gender.equals(r.gender())) {
                places.merge(r.roomTypeId() + ":" + r.roomClassId(), r.beds(), Integer::sum);
            }
        }
        Map<Long, List<TermSupply.Furniture>> furniture = supply.classFurniture();
        List<PriceLine> lines = prices(termId).stream()
                .map(p -> new PriceLine(p.roomTypeId(), p.roomType(), p.beds(), p.roomClassId(), p.roomClass(),
                        p.price(), p.deposit(), places.getOrDefault(p.roomTypeId() + ":" + p.roomClassId(), 0),
                        furniture.getOrDefault(Long.valueOf(p.roomClassId()), List.of())))
                .toList();
        String status = summary.registrationOpen() ? "Open"
                : summary.registrationOpensAt().isAfter(now) ? "Opens soon" : "Closed";
        return new Details(String.valueOf(termId), t.name(), status, t.stayStart(), t.stayEnd(), timeline,
                lines, Decimals.plain(fees.depositRate(termId).movePointRight(2)), fees.utilityDeposit(termId),
                t.houseRules(), t.faq(), t.documents());
    }

    private List<Price> prices(long termId) {
        List<Price> result = new ArrayList<>();
        for (Catalog.RoomTypeInfo type : catalog.roomTypes()) {
            if (!type.active()) {
                continue;
            }
            for (Catalog.RoomClassInfo c : catalog.roomClasses()) {
                if (!c.active()) {
                    continue;
                }
                fees.termPrice(termId, type.id(), c.id()).ifPresent(price -> result.add(new Price(
                        String.valueOf(type.id()), type.name(), type.beds(), String.valueOf(c.id()), c.name(), price,
                        fees.deposit(termId, price))));
            }
        }
        return result;
    }

    private static void moment(List<Milestone> out, String key, Instant at, Instant now) {
        if (at != null) {
            out.add(new Milestone(key, TermDrafts.LABELS.get(key), at, null, null, !at.isAfter(now)));
        }
    }
}
