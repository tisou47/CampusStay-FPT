package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.common.i18n.Messages;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.PolicyChanged;
import vn.fpt.campusstay.event.TermPublished;
import vn.fpt.campusstay.event.ValueChange;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;

/**
 * Admin › Registration periods › Terms: the step-by-step wizard (spec §6.4, ADR-20). A Draft is saved after each step
 * (General, Timeline, Rooms and places, Prices, Rules, Information) and published from the Review step. Publishing
 * fixes what the Term opened with: its price table (missing lines take the default price), Deposit, Utility Deposit,
 * eligibility switches, priority-group order and matching snapshot. After publishing, money and policy fields stay
 * editable within spec §5.2 (a date that has passed is fixed, an open deadline only moves later, money is locked once
 * an Invoice of the Term exists); every saved change needs a reason and becomes a change announcement.
 * <p>A Term built from a Manager's request needs a reason for every value that differs from the request.
 */
@Service
public class TermWizardService {

    public record General(String code, String name, LocalDate stayStart, LocalDate stayEnd) {
    }

    /**
     * @param fixed      fields that have passed and cannot change any more
     * @param extendOnly open deadlines, which can only move later
     */
    public record Milestones(TermPlan.Timeline values, String previousTerm, LocalDate previousStayEnd,
            LocalDate previousCheckOutBy, List<String> fixed, List<String> extendOnly) {
    }

    public record BlockOption(String id, String code, String name, String gender, int rooms, int beds, boolean used) {
    }

    /** A Room Type or Room Class the Term may offer; {@code used}: it does. */
    public record OfferOption(String id, String name, boolean used) {
    }

    /**
     * Supply and demand of one Room Type × Room Class × gender (spec §6.4 step 3).
     *
     * @param roomsNotMatching Rooms whose furniture does not match their class in this Term
     * @param requested        places the Manager's request asked for, null without a request line
     * @param applications     live Applications of the Term with this choice
     */
    public record SupplyRow(String roomTypeId, String roomType, String roomClassId, String roomClass, String gender,
            int rooms, int beds, int roomsNotMatching, Integer requested, long applications) {
    }

    /**
     * {@code reservedBeds}: Beds kept for new students (D-29). {@code roomTypes}, {@code roomClasses}: what the Term
     * offers (review R-03); {@code offerFixed}: it is published and keeps them.
     */
    public record Rooms(List<BlockOption> blocks, boolean allBlocks, List<String> excludedRooms,
            BigDecimal reservedNewPercent, List<SupplyRow> supply, int beds, int reservedBeds,
            List<OfferOption> roomTypes, List<OfferOption> roomClasses, boolean offerFixed) {
    }

    public record PriceRow(String roomTypeId, String roomType, String roomClassId, String roomClass, long price,
            Long defaultPrice, Long previousPrice, Long requested) {
    }

    /** {@code locked}: an Invoice of the Term exists, so the money can no longer change (spec §5.2). */
    public record Prices(List<PriceRow> rows, BigDecimal depositPercent, long utilityDeposit,
            BigDecimal defaultDepositPercent, long defaultUtilityDeposit, String previousTerm, boolean locked) {
    }

    public record Weight(String label, String level) {
    }

    public record RefundRuleView(String when, BigDecimal refundPercent, String approver) {
    }

    /** {@code fixed}: the Term is published and keeps these rules. */
    public record Rules(boolean fixed, List<String> eligibility, List<String> priorityGroups, String matching,
            List<Weight> weights, BigDecimal boost, List<RefundRuleView> refundRules) {
    }

    public record Information(String houseRules, List<TermPlan.Faq> faq, List<TermPlan.Document> documents) {
    }

    /** The Manager's request the Term is built from, with what it proposed. */
    public record RequestRef(String id, String code, String requestedBy, String status, String termName,
            LocalDate stayStart, LocalDate stayEnd, TermPlan.Proposal proposal) {
    }

    /** Something to fix before publishing; {@code step}: general, timeline, rooms, prices, rules, information. */
    public record Check(String step, String field, String message) {
    }

    /** Which steps can still be saved. */
    public record Editable(boolean general, boolean timeline, boolean rooms, boolean prices, boolean rules,
            boolean information) {
    }

    public record Wizard(String id, String code, String name, String status, boolean published, int step,
            Instant publishedAt, RequestRef request, General general, Milestones timeline, Rooms rooms, Prices prices,
            Rules rules, Information information, List<TermPlan.Difference> differences, List<Check> checks,
            Editable editable) {
    }

    /** A new Draft: {@code requestId} builds it from a Manager's request (its values fill the Draft). */
    public record DraftBody(String name, LocalDate stayStart, LocalDate stayEnd, String requestId) {
    }

    /**
     * One step's values (each step reads its own fields).
     *
     * @param reasons      field → why the Admin changed the Manager's value
     * @param changeReason why a published Term changes (shown in the change announcement)
     */
    public record StepBody(String name, LocalDate stayStart, LocalDate stayEnd, TermPlan.Timeline timeline,
            List<String> blockIds, List<String> excludedRooms, BigDecimal reservedNewPercent,
            List<String> roomTypeIds, List<String> roomClassIds, List<TermPlan.Price> prices, BigDecimal depositPercent, Long utilityDeposit, String houseRules,
            List<TermPlan.Faq> faq, List<TermPlan.Document> documents, Map<String, String> reasons,
            String changeReason) {
    }

    static final List<String> STEPS = List.of("general", "timeline", "rooms", "prices", "rules", "information");
    private static final Set<String> GENERAL_FIELDS = Set.of("name", "stayStart", "stayEnd");
    private static final Set<String> TIMELINE_FIELDS = Set.of("publishAt", "requestsOpenAt", "requestsCloseAt",
            "decisionsDueAt", "reconciliationDueAt", "feesIssueAt", "feesDueAt", "registrationOpensAt",
            "registrationClosesAt", "resultsPublishedAt", "roommateHours", "depositHours", "balanceDueAt",
            "checkInStart", "checkInEnd", "checkOutBy");
    private static final Set<String> ROOM_FIELDS = Set.of("blocks", "excludedRooms", "roomTypes", "roomClasses",
            "reservedNewPercent");
    private static final Set<String> INFORMATION_FIELDS = Set.of("houseRules", "faq");
    private static final long MAX_PRICE = 1_000_000_000L;
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final TermDrafts drafts;
    private final TermDifferences differences;
    private final TermRequestService requests;
    private final TermSupply supply;
    private final Messages messages;
    private final Catalog catalog;
    private final FeePolicy fees;
    private final EligibilityRules eligibility;
    private final MatchingCriteria matching;
    private final Parameters parameters;
    private final ObjectProvider<StudentTerms> studentTerms;
    private final ObjectProvider<TermInvoices> invoices;
    private final UserDirectory users;
    private final CurrentUser currentUser;
    private final AuditLog audit;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public TermWizardService(JdbcClient jdbc, JsonMapper json, TermDrafts drafts, TermDifferences differences,
            TermRequestService requests, TermSupply supply, Messages messages, Catalog catalog, FeePolicy fees,
            EligibilityRules eligibility, MatchingCriteria matching, Parameters parameters,
            ObjectProvider<StudentTerms> studentTerms, ObjectProvider<TermInvoices> invoices, UserDirectory users,
            CurrentUser currentUser, AuditLog audit, ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.json = json;
        this.drafts = drafts;
        this.differences = differences;
        this.requests = requests;
        this.supply = supply;
        this.messages = messages;
        this.catalog = catalog;
        this.fees = fees;
        this.eligibility = eligibility;
        this.matching = matching;
        this.parameters = parameters;
        this.studentTerms = studentTerms;
        this.invoices = invoices;
        this.users = users;
        this.currentUser = currentUser;
        this.audit = audit;
        this.events = events;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- a new Draft

    @Transactional
    public long createDraft(DraftBody body) {
        currentUser.require(Permission.CONFIGURE);
        Long requestId = id(body == null ? null : body.requestId());
        TermRequestService.Built request = requestId == null ? null : requests.forBuilding(requestId);
        if (request != null && request.termId() != null && drafts.find(request.termId()).isPresent()) {
            return request.termId();
        }
        String name = text(body == null ? null : body.name());
        LocalDate stayStart = body == null ? null : body.stayStart();
        LocalDate stayEnd = body == null ? null : body.stayEnd();
        if (request != null) {
            name = name == null ? request.termName() : name;
            stayStart = stayStart == null ? request.stayStart() : stayStart;
            stayEnd = stayEnd == null ? request.stayEnd() : stayEnd;
        }
        FieldErrors errors = new FieldErrors();
        checkGeneral(name, stayStart, stayEnd, errors);
        errors.throwIfAny();

        Optional<TermDrafts.Term> previous = previousTerm(stayStart, null);
        TermPlan.Proposal proposal = request == null ? null : request.proposal();
        TermPlan.Timeline timeline = proposal != null && proposal.timeline() != null ? proposal.timeline()
                : TermPlan.Timeline.empty();
        Integer roommate = timeline.roommateHours() != null ? timeline.roommateHours()
                : previous.map(p -> p.timeline().roommateHours()).orElse(null);
        Integer deposit = timeline.depositHours() != null ? timeline.depositHours()
                : jdbc.sql("SELECT deposit_hours FROM cfg_fee_policy WHERE id = 1").query(Integer.class).single();
        timeline = new TermPlan.Timeline(timeline.publishAt(), timeline.requestsOpenAt(), timeline.requestsCloseAt(),
                timeline.decisionsDueAt(), timeline.reconciliationDueAt(), timeline.feesIssueAt(), timeline.feesDueAt(),
                timeline.registrationOpensAt(), timeline.registrationClosesAt(), timeline.resultsPublishedAt(),
                roommate, deposit, timeline.balanceDueAt(), timeline.checkInStart(), timeline.checkInEnd(),
                timeline.checkOutBy());

        String finalName = name;
        String code = AdminTermService.uniqueCode(finalName, stayStart, c -> jdbc.sql(
                "SELECT count(*) FROM cfg_term WHERE code = :c").param("c", c).query(Long.class).single() > 0);
        BigDecimal reservedNew = proposal != null && proposal.reservedNewPercent() != null
                ? proposal.reservedNewPercent()
                : BigDecimal.valueOf(parameters.intValue("stay.reserved_new_percent"));
        long id = jdbc.sql("""
                INSERT INTO cfg_term (code, name, status, stay_start, stay_end, wizard_step, reserved_new_percent)
                VALUES (:code, :name, 'DRAFT', :start, :end, 1, :reserved)
                RETURNING id
                """)
                .param("code", code).param("name", finalName).param("start", stayStart).param("end", stayEnd)
                .param("reserved", reservedNew)
                .query(Long.class).single();
        drafts.writeTimeline(id, timeline);
        Set<Long> offeredTypes = proposal == null ? Set.of() : ids(proposal.roomTypes(), typeNames().keySet());
        Set<Long> offeredClasses = proposal == null ? Set.of() : ids(proposal.roomClasses(), classNames().keySet());
        drafts.writeOffer(id, offeredTypes, offeredClasses);

        Map<String, Long> requested = new HashMap<>();
        if (proposal != null && proposal.prices() != null) {
            proposal.prices().forEach(p -> requested.put(p.roomTypeId() + ":" + p.roomClassId(), p.price()));
        }
        Map<String, Long> prices = new LinkedHashMap<>();
        for (Catalog.RoomTypeInfo t : offered(activeTypes(), offeredTypes, Catalog.RoomTypeInfo::id)) {
            for (Catalog.RoomClassInfo c : offered(activeClasses(), offeredClasses, Catalog.RoomClassInfo::id)) {
                String key = t.id() + ":" + c.id();
                Long price = requested.get(key);
                if (price == null && previous.isPresent()) {
                    price = previous.get().prices().get(key);
                }
                if (price == null) {
                    OptionalLong standard = fees.defaultTermPrice(t.id(), c.id());
                    price = standard.isPresent() ? standard.getAsLong() : null;
                }
                if (price != null) {
                    prices.put(key, price);
                }
            }
        }
        drafts.writePrices(id, prices,
                proposal != null && proposal.depositPercent() != null ? proposal.depositPercent()
                        : fees.depositRate().movePointRight(2),
                proposal != null && proposal.utilityDeposit() != null ? proposal.utilityDeposit() : fees.utilityDeposit());

        if (proposal != null) {
            Map<String, Long> blockIds = supply.blocks().stream()
                    .collect(Collectors.toMap(b -> b.code().toUpperCase(Locale.ROOT), TermSupply.Block::id));
            Set<Long> blocks = new LinkedHashSet<>();
            (proposal.blocks() == null ? List.<String>of() : proposal.blocks())
                    .forEach(c -> Optional.ofNullable(blockIds.get(c.toUpperCase(Locale.ROOT))).ifPresent(blocks::add));
            Set<Long> rooms = supply.roomsByCode(proposal.excludedRooms() == null ? List.of() : proposal.excludedRooms())
                    .values().stream().map(TermSupply.Room::id).collect(Collectors.toCollection(LinkedHashSet::new));
            drafts.writeRooms(id, blocks, rooms, reservedNew);
        }
        String houseRules = proposal != null && proposal.houseRules() != null ? proposal.houseRules()
                : previous.map(TermDrafts.Term::houseRules).orElse(null);
        List<TermPlan.Faq> faq = proposal != null && proposal.faq() != null ? proposal.faq()
                : previous.map(TermDrafts.Term::faq).orElse(List.of());
        if (houseRules != null || !faq.isEmpty() || previous.isPresent()) {
            drafts.writeInformation(id, houseRules, faq, previous.map(TermDrafts.Term::documents).orElse(List.of()));
        }
        if (request != null) {
            requests.built(request.id(), id);
        }
        audit.record("TERM_CREATED", AuditLog.Tone.INFO, "Term", id, finalName,
                request == null ? null : Map.of("request", request.code()));
        return id;
    }

    // ---------------------------------------------------------------- reading

    @Transactional(readOnly = true)
    public Wizard wizard(long id) {
        currentUser.require(Permission.CONFIGURE);
        TermDrafts.Term t = drafts.get(id);
        Instant now = Instant.now(clock);
        boolean published = !t.draft();
        boolean ended = published && today(now).isAfter(t.stayEnd());
        Optional<TermRequestService.Built> request = requests.ofTerm(id);
        Optional<TermTimelines.Previous> previous = drafts.previous(t.stayStart(), id);
        Optional<TermDrafts.Term> previousTerm = previousTerm(t.stayStart(), id);

        RequestRef ref = request.map(r -> new RequestRef(String.valueOf(r.id()), r.code(),
                users.displayNames(List.of(r.requesterId())).get(r.requesterId()),
                TermRequestService.STATUS.get(r.status()), r.termName(), r.stayStart(), r.stayEnd(), r.proposal()))
                .orElse(null);
        List<TermPlan.Difference> changed = request
                .map(r -> differences.of(t, r.termName(), r.stayStart(), r.stayEnd(), r.proposal()))
                .orElse(List.of());

        List<String> fixed = new ArrayList<>();
        List<String> extendOnly = new ArrayList<>();
        if (published) {
            limits(t, now, fixed, extendOnly);
        }
        Milestones milestones = new Milestones(t.timeline(), previous.map(TermTimelines.Previous::name).orElse(null),
                previous.map(TermTimelines.Previous::stayEnd).orElse(null),
                previous.map(TermTimelines.Previous::checkOutBy).orElse(null), fixed, extendOnly);

        boolean locked = published && invoicesExist(id);
        Rooms rooms = rooms(t, request.map(TermRequestService.Built::proposal).orElse(null));
        Prices prices = prices(t, previousTerm.orElse(null), request.map(TermRequestService.Built::proposal).orElse(null),
                locked);
        Rules rules = rules(t);
        Information information = new Information(t.houseRules(), t.faq(), t.documents());
        List<Check> checks = published ? List.of() : checks(t, previous.orElse(null), changed, now).stream()
                .map(c -> new Check(c.step(), c.field(), messages.translate(c.message(), Locales.ofRequest())))
                .toList();
        Editable editable = new Editable(!ended, !ended, !ended, !ended && !locked, !published, !ended);
        return new Wizard(String.valueOf(t.id()), t.code(), t.name(), published ? statusLabel(t, now) : "Draft",
                published, t.wizardStep(), t.publishedAt(), ref,
                new General(t.code(), t.name(), t.stayStart(), t.stayEnd()), milestones, rooms, prices, rules,
                information, changed, checks, editable);
    }

    // ---------------------------------------------------------------- saving a step

    @Transactional
    public long save(long id, String step, StepBody body) {
        currentUser.require(Permission.CONFIGURE);
        int stepNo = STEPS.indexOf(step == null ? "" : step.trim().toLowerCase(Locale.ROOT)) + 1;
        if (stepNo == 0) {
            throw ApiException.notFound("This wizard step does not exist.");
        }
        StepBody b = body == null ? new StepBody(null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null) : body;
        TermDrafts.Term before = drafts.lock(id);
        Instant now = Instant.now(clock);
        boolean published = !before.draft();
        if (published && today(now).isAfter(before.stayEnd())) {
            throw ApiException.conflict("TERM_CLOSED", "This Term has ended and can no longer be changed.");
        }
        FieldErrors errors = new FieldErrors();
        String category = "REGISTRATION";
        Set<String> stepFields = Set.of();
        switch (stepNo) {
            case 1 -> {
                stepFields = GENERAL_FIELDS;
                String name = text(b.name());
                checkGeneral(name, b.stayStart(), b.stayEnd(), errors);
                if (published) {
                    boolean started = !today(now).isBefore(before.stayStart());
                    errors.check(!started || Objects.equals(b.stayStart(), before.stayStart())
                            && Objects.equals(b.stayEnd(), before.stayEnd()), "stayStart",
                            "The stay has started, so its dates cannot change.");
                    drafts.overlapping(b.stayStart(), b.stayEnd(), id).ifPresent(other -> errors.add("stayStart",
                            "The stay dates overlap " + other + ". Published Terms cannot overlap."));
                }
                errors.throwIfAny();
                jdbc.sql("""
                        UPDATE cfg_term SET name = :name, stay_start = :start, stay_end = :end, updated_at = now(),
                               version = version + 1
                        WHERE id = :id
                        """)
                        .param("name", name).param("start", b.stayStart()).param("end", b.stayEnd()).param("id", id)
                        .update();
            }
            case 2 -> {
                stepFields = TIMELINE_FIELDS;
                TermPlan.Timeline timeline = b.timeline() == null ? TermPlan.Timeline.empty() : b.timeline();
                TermTimelines.check(timeline, before.stayStart(), before.stayEnd(),
                        drafts.previous(before.stayStart(), id).orElse(null), true, errors);
                if (published) {
                    checkPublishedTimeline(before, timeline, now, errors);
                }
                errors.throwIfAny();
                drafts.writeTimeline(id, timeline);
            }
            case 3 -> {
                stepFields = ROOM_FIELDS;
                Map<Long, TermSupply.Block> blocks = supply.blocks().stream()
                        .collect(Collectors.toMap(TermSupply.Block::id, Function.identity()));
                Set<Long> used = new LinkedHashSet<>();
                for (String raw : b.blockIds() == null ? List.<String>of() : b.blockIds()) {
                    Long blockId = id(raw);
                    if (blockId == null || !blocks.containsKey(blockId)) {
                        errors.add("blockIds", "Choose active Blocks only.");
                    } else {
                        used.add(blockId);
                    }
                }
                if (used.size() == blocks.size()) {
                    used.clear(); // every Block: stored as "all", so new Blocks join too
                }
                List<String> codes = b.excludedRooms() == null ? List.of() : b.excludedRooms().stream()
                        .filter(c -> c != null && !c.isBlank()).map(c -> c.trim().toUpperCase(Locale.ROOT)).distinct()
                        .toList();
                Map<String, TermSupply.Room> known = supply.roomsByCode(codes);
                codes.forEach(c -> errors.check(known.containsKey(c), "excludedRooms", "Room " + c + " does not exist."));
                BigDecimal reserved = b.reservedNewPercent() == null ? BigDecimal.ZERO : b.reservedNewPercent();
                errors.check(reserved.signum() >= 0 && reserved.compareTo(HUNDRED) <= 0, "reservedNewPercent",
                        "Enter a share from 0 to 100%.");
                Set<Long> activeTypeIds = activeTypes().stream().map(Catalog.RoomTypeInfo::id)
                        .collect(Collectors.toSet());
                Set<Long> activeClassIds = activeClasses().stream().map(Catalog.RoomClassInfo::id)
                        .collect(Collectors.toSet());
                Set<Long> offeredTypes = offerIds(b.roomTypeIds(), activeTypeIds, "roomTypeIds",
                        "Choose at least one active Room Type.", errors);
                Set<Long> offeredClasses = offerIds(b.roomClassIds(), activeClassIds, "roomClassIds",
                        "Choose at least one active Room Class.", errors);
                if (published && (!offeredTypes.equals(before.roomTypes())
                        || !offeredClasses.equals(before.roomClasses()))) {
                    errors.add("roomTypeIds", "A published Term keeps the Room Types and Room Classes it offers.");
                }
                errors.throwIfAny();
                drafts.writeOffer(id, offeredTypes, offeredClasses);
                drafts.writeRooms(id, used, known.values().stream().map(TermSupply.Room::id)
                        .collect(Collectors.toCollection(LinkedHashSet::new)), reserved.setScale(2, RoundingMode.HALF_UP));
            }
            case 4 -> {
                category = "FINANCE";
                if (published && invoicesExist(id)) {
                    throw ApiException.conflict("PRICES_LOCKED",
                            "Invoices of this Term exist, so its prices, Deposit and Utility Deposit can no longer change.");
                }
                Map<String, Long> prices = new LinkedHashMap<>();
                Set<String> wanted = new LinkedHashSet<>();
                offered(activeTypes(), before.roomTypes(), Catalog.RoomTypeInfo::id)
                        .forEach(t -> offered(activeClasses(), before.roomClasses(), Catalog.RoomClassInfo::id)
                                .forEach(c -> wanted.add(t.id() + ":" + c.id())));
                for (TermPlan.Price p : b.prices() == null ? List.<TermPlan.Price>of() : b.prices()) {
                    String key = id(p.roomTypeId()) + ":" + id(p.roomClassId());
                    if (!wanted.contains(key)) {
                        errors.add("prices", "Choose an active Room Type and Room Class for each price.");
                    } else if (p.price() == null || p.price() <= 0 || p.price() > MAX_PRICE) {
                        errors.add("prices", "Enter each price per Bed as a whole amount above 0 VND.");
                    } else {
                        prices.put(key, p.price());
                    }
                }
                errors.check(prices.keySet().containsAll(wanted), "prices",
                        "Enter a price for every Room Type and Room Class the Term offers.");
                BigDecimal percent = b.depositPercent();
                errors.check(percent != null && percent.signum() > 0 && percent.compareTo(HUNDRED) <= 0,
                        "depositPercent", "Enter a deposit rate above 0 and up to 100.");
                errors.check(b.utilityDeposit() != null && b.utilityDeposit() >= 0 && b.utilityDeposit() <= MAX_PRICE,
                        "utilityDeposit", "Enter the Utility Deposit as a whole amount of 0 VND or more.");
                errors.throwIfAny();
                drafts.writePrices(id, prices, percent.setScale(2, RoundingMode.HALF_UP), b.utilityDeposit());
                stepFields = prices.keySet().stream().map(k -> "price:" + k).collect(Collectors.toSet());
                stepFields.add("depositPercent");
                stepFields.add("utilityDeposit");
            }
            case 5 -> {
                if (published) {
                    throw ApiException.conflict("RULES_FIXED", "A published Term keeps the rules it opened with.");
                }
            }
            default -> {
                category = "RULES";
                stepFields = INFORMATION_FIELDS;
                String rules = b.houseRules() == null || b.houseRules().isBlank() ? null : b.houseRules().trim();
                errors.check(rules == null || rules.length() <= 10_000, "houseRules",
                        "Keep the house rules under 10,000 characters.");
                List<TermPlan.Faq> faq = new ArrayList<>();
                for (TermPlan.Faq f : b.faq() == null ? List.<TermPlan.Faq>of() : b.faq()) {
                    String q = text(f.question());
                    String a = text(f.answer());
                    if (q == null && a == null) {
                        continue;
                    }
                    if (q == null || a == null || q.length() > 300 || a.length() > 2000) {
                        errors.add("faq", "Write each question (up to 300 characters) with its answer (up to 2,000).");
                    } else {
                        faq.add(new TermPlan.Faq(q, a));
                    }
                }
                errors.check(faq.size() <= 30, "faq", "Keep at most 30 questions.");
                List<TermPlan.Document> documents = new ArrayList<>();
                for (TermPlan.Document d : b.documents() == null ? List.<TermPlan.Document>of() : b.documents()) {
                    String title = text(d.title());
                    String url = text(d.url());
                    if (title == null && url == null) {
                        continue;
                    }
                    if (title == null || title.length() > 150 || url == null || url.length() > 500
                            || !url.matches("(?i)https?://\\S+")) {
                        errors.add("documents", "Give each document a title and a link that starts with https://.");
                    } else {
                        documents.add(new TermPlan.Document(title, url));
                    }
                }
                errors.check(documents.size() <= 20, "documents", "Keep at most 20 documents.");
                errors.throwIfAny();
                drafts.writeInformation(id, rules, faq, documents);
            }
        }

        TermDrafts.Term after = drafts.get(id);
        checkReasons(after, stepFields, b.reasons());
        drafts.writeStep(id, stepNo);
        List<ValueChange> changes = changes(before, after, stepNo);
        String changeReason = text(b.changeReason());
        if (published && !changes.isEmpty()) {
            if (changeReason == null || changeReason.length() > 500) {
                throw FieldErrors.single("changeReason",
                        "Say in up to 500 characters why you change a published Term; students read it in the announcement.");
            }
            List<ValueChange> announced = stepNo == 6
                    ? changes.stream().filter(c -> c.field().equals("House rules")).toList()
                    : changes;
            if (!announced.isEmpty()) {
                events.publishEvent(new PolicyChanged(category, after.name(), id, null, announced, changeReason));
            }
        }
        if (!changes.isEmpty()) {
            Map<String, Object> change = new LinkedHashMap<>();
            changes.forEach(c -> change.put(c.field(), shortPair(c)));
            if (changeReason != null) {
                change.put("reason", changeReason);
            }
            audit.record("TERM_UPDATED", AuditLog.Tone.INFO, "Term", id, after.name(), change);
        }
        return id;
    }

    // ---------------------------------------------------------------- publishing

    /** Draft → Published (spec §6.4 step 7): fixes the Term's money and rules, tells Managers and students. */
    @Transactional
    public long publish(long id) {
        currentUser.require(Permission.CONFIGURE);
        TermDrafts.Term t = drafts.lock(id);
        if (!t.draft()) {
            throw ApiException.conflict("TERM_ALREADY_PUBLISHED", "This Term is already published.");
        }
        Optional<String> overlap = drafts.overlapping(t.stayStart(), t.stayEnd(), id);
        if (overlap.isPresent()) {
            throw ApiException.conflict("TERM_OVERLAP",
                    "The stay dates overlap " + overlap.get() + ". Published Terms cannot overlap.");
        }
        Instant now = Instant.now(clock);
        List<TermPlan.Difference> changed = requests.ofTerm(id)
                .map(r -> differences.of(t, r.termName(), r.stayStart(), r.stayEnd(), r.proposal()))
                .orElse(List.of());
        List<Check> checks = checks(t, drafts.previous(t.stayStart(), id).orElse(null), changed, now);
        if (!checks.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "TERM_NOT_READY",
                    "This Term is not ready to publish. The Review step lists what to fix.", Map.of("checks", checks));
        }
        // The money the Term opens with: lines added since the prices step take the default price.
        Map<String, Long> prices = new LinkedHashMap<>();
        for (Catalog.RoomTypeInfo type : offered(activeTypes(), t.roomTypes(), Catalog.RoomTypeInfo::id)) {
            for (Catalog.RoomClassInfo c : offered(activeClasses(), t.roomClasses(), Catalog.RoomClassInfo::id)) {
                String key = type.id() + ":" + c.id();
                if (t.prices().containsKey(key)) {
                    prices.put(key, t.prices().get(key));
                } else {
                    fees.defaultTermPrice(type.id(), c.id()).ifPresent(p -> prices.put(key, p));
                }
            }
        }
        drafts.writePrices(id, prices,
                t.depositPercent() != null ? t.depositPercent() : fees.depositRate().movePointRight(2),
                t.utilityDeposit() != null ? t.utilityDeposit() : fees.utilityDeposit());
        // The rules it opens with (ADR-20): later edits apply to the Terms published after them.
        jdbc.sql("""
                UPDATE cfg_term SET status = 'PUBLISHED', published_at = :now, wizard_step = 7,
                       matching_snapshot_id = :snapshot, eligibility_keys = CAST(:eligibility AS jsonb),
                       priority_group_keys = CAST(:groups AS jsonb), updated_at = :now, version = version + 1
                WHERE id = :id
                """)
                .param("now", Timestamp.from(now)).param("snapshot", matching.active().id())
                .param("eligibility", json.writeValueAsString(eligibility.enabled().stream()
                        .map(EligibilityRules.Criterion::key).toList()))
                .param("groups", json.writeValueAsString(eligibility.priorityGroupKeys()))
                .param("id", id)
                .update();
        requests.done(id);
        audit.record("TERM_PUBLISHED", AuditLog.Tone.SUCCESS, "Term", id, t.name(), null);
        long fromPrice = prices.values().stream().mapToLong(Long::longValue).min().orElse(0);
        events.publishEvent(new TermPublished(id, t.name(), t.stayStart(), t.stayEnd(),
                t.timeline().registrationOpensAt(), t.timeline().registrationClosesAt(), fromPrice,
                users.activeUserIds(Role.MANAGER.name())));
        return id;
    }

    // ---------------------------------------------------------------- parts of the wizard

    private Rooms rooms(TermDrafts.Term t, TermPlan.Proposal proposal) {
        List<TermSupply.Block> blocks = supply.blocks();
        boolean all = t.blocks().isEmpty();
        List<BlockOption> options = blocks.stream()
                .map(b -> new BlockOption(String.valueOf(b.id()), b.code(), b.name(), b.gender(), b.rooms(), b.beds(),
                        all || t.blocks().contains(b.id())))
                .toList();
        List<String> excluded = supply.roomCodes(t.excludedRooms()).values().stream().sorted().toList();
        Map<Long, String> types = typeNames();
        Map<Long, String> classes = classNames();
        Map<String, Integer> requested = new HashMap<>();
        if (proposal != null && proposal.places() != null) {
            proposal.places().forEach(p -> requested.put(p.roomTypeId() + ":" + p.roomClassId() + ":" + p.gender(),
                    p.places()));
        }
        StudentTerms demand = studentTerms.getIfAvailable();
        Map<String, Long> applications = demand == null ? Map.of() : demand.liveApplicationsByChoice(t.id());
        Map<String, int[]> totals = new LinkedHashMap<>();
        for (TermSupply.Row r : supply.supply(t.id(), new TermCatalog.TermRooms(t.blocks(), t.excludedRooms(),
                t.roomTypes(), t.roomClasses()))) {
            int[] sum = totals.computeIfAbsent(r.roomTypeId() + ":" + r.roomClassId() + ":" + r.gender(),
                    k -> new int[3]);
            sum[0] += r.rooms();
            sum[1] += r.beds();
            sum[2] += r.roomsNotMatching();
        }
        Set<String> keys = new LinkedHashSet<>(totals.keySet());
        keys.addAll(requested.keySet());
        keys.addAll(applications.keySet());
        List<SupplyRow> rows = keys.stream()
                .map(k -> {
                    String[] p = k.split(":");
                    int[] sum = totals.getOrDefault(k, new int[3]);
                    return new SupplyRow(p[0], types.get(Long.valueOf(p[0])), p[1], classes.get(Long.valueOf(p[1])),
                            p[2], sum[0], sum[1], sum[2], requested.get(k), applications.getOrDefault(k, 0L));
                })
                .sorted((a, b) -> {
                    int byType = order(types, a.roomTypeId()) - order(types, b.roomTypeId());
                    if (byType != 0) {
                        return byType;
                    }
                    int byClass = order(classes, a.roomClassId()) - order(classes, b.roomClassId());
                    return byClass != 0 ? byClass : b.gender().compareTo(a.gender());
                })
                .toList();
        int beds = rows.stream().mapToInt(SupplyRow::beds).sum();
        int reserved = BigDecimal.valueOf(beds).multiply(t.reservedNewPercent()).divide(HUNDRED, 0, RoundingMode.HALF_UP)
                .intValue();
        List<OfferOption> typeOptions = activeTypes().stream()
                .map(x -> new OfferOption(String.valueOf(x.id()), x.name(),
                        t.roomTypes().isEmpty() || t.roomTypes().contains(x.id())))
                .toList();
        List<OfferOption> classOptions = activeClasses().stream()
                .map(x -> new OfferOption(String.valueOf(x.id()), x.name(),
                        t.roomClasses().isEmpty() || t.roomClasses().contains(x.id())))
                .toList();
        return new Rooms(options, all, excluded, Decimals.plain(t.reservedNewPercent()), rows, beds, reserved,
                typeOptions, classOptions, !t.draft());
    }

    private Prices prices(TermDrafts.Term t, TermDrafts.Term previous, TermPlan.Proposal proposal, boolean locked) {
        Map<String, Long> requested = new HashMap<>();
        if (proposal != null && proposal.prices() != null) {
            proposal.prices().forEach(p -> requested.put(p.roomTypeId() + ":" + p.roomClassId(), p.price()));
        }
        List<PriceRow> rows = new ArrayList<>();
        for (Catalog.RoomTypeInfo type : offered(activeTypes(), t.roomTypes(), Catalog.RoomTypeInfo::id)) {
            for (Catalog.RoomClassInfo c : offered(activeClasses(), t.roomClasses(), Catalog.RoomClassInfo::id)) {
                String key = type.id() + ":" + c.id();
                OptionalLong standard = fees.defaultTermPrice(type.id(), c.id());
                Long price = t.prices().get(key);
                if (price == null && standard.isEmpty()) {
                    continue;
                }
                rows.add(new PriceRow(String.valueOf(type.id()), type.name(), String.valueOf(c.id()), c.name(),
                        price != null ? price : standard.getAsLong(),
                        standard.isPresent() ? standard.getAsLong() : null,
                        previous == null ? null : previous.prices().get(key), requested.get(key)));
            }
        }
        BigDecimal defaultPercent = Decimals.plain(fees.depositRate().movePointRight(2));
        return new Prices(rows, t.depositPercent() == null ? defaultPercent : Decimals.plain(t.depositPercent()),
                t.utilityDeposit() == null ? fees.utilityDeposit() : t.utilityDeposit(), defaultPercent,
                fees.utilityDeposit(), previous == null ? null : previous.name(), locked);
    }

    private Rules rules(TermDrafts.Term t) {
        boolean fixed = !t.draft();
        List<String> criteria = (fixed ? eligibility.enabled(t.id()) : eligibility.enabled()).stream()
                .map(EligibilityRules.Criterion::title).toList();
        List<String> groupKeys = fixed ? eligibility.priorityGroupKeys(t.id()) : eligibility.priorityGroupKeys();
        Map<String, String> groupTitles = new HashMap<>();
        jdbc.sql("SELECT key, title FROM cfg_priority_group")
                .query((rs, i) -> Map.entry(rs.getString("key"), rs.getString("title"))).list()
                .forEach(e -> groupTitles.put(e.getKey(), e.getValue()));
        MatchingCriteria.Snapshot snapshot = fixed ? matching.forTerm(t.id()) : matching.active();
        List<Integer> inUse = snapshot.weights().stream().map(w -> percent(w.value())).toList();
        List<Weight> weights = snapshot.weights().stream()
                .map(w -> new Weight(w.label(), MatchingLevels.level(true, percent(w.value()), inUse)))
                .toList();
        List<RefundRuleView> refunds = jdbc.sql("""
                SELECT description, refund_percent, approver_role FROM cfg_refund_rule WHERE active ORDER BY sort_order, id
                """)
                .query((rs, i) -> new RefundRuleView(rs.getString("description"),
                        Decimals.plain(rs.getBigDecimal("refund_percent")), approver(rs.getString("approver_role"))))
                .list();
        return new Rules(fixed, criteria, groupKeys.stream().map(k -> groupTitles.getOrDefault(k, k)).toList(),
                snapshot.label(), weights, Decimals.plain(snapshot.boost()), refunds);
    }

    /** What stops a Draft from being published. */
    private List<Check> checks(TermDrafts.Term t, TermTimelines.Previous previous, List<TermPlan.Difference> changed,
            Instant now) {
        List<Check> checks = new ArrayList<>();
        FieldErrors general = new FieldErrors();
        checkGeneral(t.name(), t.stayStart(), t.stayEnd(), general);
        drafts.overlapping(t.stayStart(), t.stayEnd(), t.id()).ifPresent(other -> general.add("stayStart",
                "The stay dates overlap " + other + ". Published Terms cannot overlap."));
        general.messages().forEach((field, message) -> checks.add(new Check("general", field, message)));
        FieldErrors timeline = new FieldErrors();
        TermTimelines.check(t.timeline(), t.stayStart(), t.stayEnd(), previous, true, timeline);
        if (t.timeline().requestsOpenAt() != null && t.timeline().requestsOpenAt().isBefore(now)) {
            timeline.add("requestsOpenAt", "The requests window would open before students see the Term: move it after today.");
        }
        timeline.messages().forEach((field, message) -> checks.add(new Check("timeline", field, message)));
        for (TermPlan.Difference d : changed) {
            if (d.reason() == null || d.reason().isBlank()) {
                checks.add(new Check(stepOf(d.field()), d.field(), "Give a reason for changing the Manager's value."));
            }
        }
        if (t.wizardStep() < STEPS.size()) {
            checks.add(new Check(STEPS.get(Math.max(0, t.wizardStep())), null,
                    "Save every step of the wizard before publishing."));
        }
        return checks;
    }

    /** Merges the reasons sent with the stored ones; every value of the step that differs from the request needs one. */
    private void checkReasons(TermDrafts.Term t, Set<String> stepFields, Map<String, String> sent) {
        Optional<TermRequestService.Built> request = requests.ofTerm(t.id());
        if (request.isEmpty()) {
            return;
        }
        TermRequestService.Built r = request.get();
        Map<String, String> reasons = new LinkedHashMap<>(t.changeReasons());
        if (sent != null) {
            sent.forEach((field, reason) -> {
                String value = text(reason);
                if (value == null) {
                    reasons.remove(field);
                } else {
                    reasons.put(field, value.length() > 500 ? value.substring(0, 500) : value);
                }
            });
        }
        TermDrafts.Term withReasons = new TermDrafts.Term(t.id(), t.code(), t.name(), t.status(), t.stayStart(),
                t.stayEnd(), t.timeline(), t.reservedNewPercent(), t.depositPercent(), t.utilityDeposit(),
                t.matchingSnapshotId(), t.eligibilityKeys(), t.priorityGroupKeys(), t.houseRules(), t.faq(),
                t.documents(), t.wizardStep(), reasons, t.publishedAt(), t.blocks(), t.excludedRooms(), t.prices(),
                t.roomTypes(), t.roomClasses());
        List<TermPlan.Difference> changed = differences.of(withReasons, r.termName(), r.stayStart(), r.stayEnd(),
                r.proposal());
        Set<String> differing = changed.stream().map(TermPlan.Difference::field).collect(Collectors.toSet());
        reasons.keySet().removeIf(field -> !differing.contains(field));
        FieldErrors errors = new FieldErrors();
        for (TermPlan.Difference d : changed) {
            if (stepFields.contains(d.field()) && (d.reason() == null || d.reason().isBlank())) {
                errors.add(d.field(), "Give a reason for changing the Manager's value.");
            }
        }
        errors.throwIfAny();
        drafts.writeReasons(t.id(), reasons);
    }

    /** After publishing: a date that has passed is fixed; a deadline whose window is open only moves later. */
    private void checkPublishedTimeline(TermDrafts.Term t, TermPlan.Timeline next, Instant now, FieldErrors errors) {
        List<String> fixed = new ArrayList<>();
        List<String> extendOnly = new ArrayList<>();
        limits(t, now, fixed, extendOnly);
        Map<String, Object> old = timelineValues(t.timeline());
        Map<String, Object> neu = timelineValues(next);
        for (String field : fixed) {
            if (!Objects.equals(old.get(field), neu.get(field))) {
                errors.add(field, "This date has passed, so it cannot change.");
            }
        }
        for (String field : extendOnly) {
            Object before = old.get(field);
            Object after = neu.get(field);
            if (before != null && (after == null || compare(after, before) < 0)) {
                errors.add(field, "This deadline is open: it can be extended but never shortened.");
            }
        }
    }

    private void limits(TermDrafts.Term t, Instant now, List<String> fixed, List<String> extendOnly) {
        TermPlan.Timeline v = t.timeline();
        Map<String, Object> values = timelineValues(v);
        for (String start : List.of("publishAt", "requestsOpenAt", "feesIssueAt", "registrationOpensAt",
                "resultsPublishedAt", "checkInStart")) {
            if (passed(values.get(start), now)) {
                fixed.add(start);
            }
        }
        Map<String, String> deadlines = new LinkedHashMap<>();
        deadlines.put("requestsCloseAt", "requestsOpenAt");
        deadlines.put("decisionsDueAt", "requestsOpenAt");
        deadlines.put("reconciliationDueAt", "requestsOpenAt");
        deadlines.put("feesDueAt", "feesIssueAt");
        deadlines.put("registrationClosesAt", "registrationOpensAt");
        deadlines.put("balanceDueAt", "resultsPublishedAt");
        deadlines.put("checkInEnd", "checkInStart");
        deadlines.put("checkOutBy", "checkInStart");
        deadlines.forEach((deadline, start) -> {
            if (passed(values.get(start), now)) {
                extendOnly.add(deadline);
            }
        });
    }

    private List<ValueChange> changes(TermDrafts.Term before, TermDrafts.Term after, int step) {
        List<ValueChange> out = new ArrayList<>();
        switch (step) {
            case 1 -> {
                change(out, "name", before.name(), after.name());
                change(out, "stayStart", before.stayStart(), after.stayStart());
                change(out, "stayEnd", before.stayEnd(), after.stayEnd());
            }
            case 2 -> {
                Map<String, Object> old = timelineValues(before.timeline());
                Map<String, Object> neu = timelineValues(after.timeline());
                old.keySet().forEach(field -> change(out, field, old.get(field), neu.get(field)));
            }
            case 3 -> {
                Map<Long, String> codes = supply.blocks().stream()
                        .collect(Collectors.toMap(TermSupply.Block::id, TermSupply.Block::code));
                change(out, "blocks", blockText(before.blocks(), codes), blockText(after.blocks(), codes));
                change(out, "excludedRooms", TermDifferences.codes(supply.roomCodes(before.excludedRooms()).values()),
                        TermDifferences.codes(supply.roomCodes(after.excludedRooms()).values()));
                change(out, "reservedNewPercent", Decimals.plain(before.reservedNewPercent()),
                        Decimals.plain(after.reservedNewPercent()));
                change(out, "roomTypes", offerText(before.roomTypes(), typeNames(), "All Room Types"),
                        offerText(after.roomTypes(), typeNames(), "All Room Types"));
                change(out, "roomClasses", offerText(before.roomClasses(), classNames(), "All Room Classes"),
                        offerText(after.roomClasses(), classNames(), "All Room Classes"));
            }
            case 4 -> {
                Map<Long, String> types = typeNames();
                Map<Long, String> classes = classNames();
                Set<String> keys = new LinkedHashSet<>(before.prices().keySet());
                keys.addAll(after.prices().keySet());
                for (String key : keys) {
                    Long old = before.prices().get(key);
                    Long neu = after.prices().get(key);
                    if (!Objects.equals(old, neu)) {
                        String[] ids = key.split(":");
                        out.add(new ValueChange("Price · " + types.get(Long.valueOf(ids[0])) + " · "
                                + classes.get(Long.valueOf(ids[1])), "MONEY", old == null ? null : String.valueOf(old),
                                neu == null ? null : String.valueOf(neu)));
                    }
                }
                change(out, "depositPercent", Decimals.plain(before.depositPercent()),
                        Decimals.plain(after.depositPercent()));
                change(out, "utilityDeposit", before.utilityDeposit(), after.utilityDeposit());
            }
            case 6 -> {
                change(out, "houseRules", before.houseRules(), after.houseRules());
                change(out, "faq", before.faq().size() + " questions", after.faq().size() + " questions");
                change(out, "documents", before.documents().size() + " documents",
                        after.documents().size() + " documents");
            }
            default -> {
            }
        }
        return out;
    }

    private static void change(List<ValueChange> out, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            out.add(new ValueChange(TermDrafts.LABELS.get(field), TermDrafts.TYPES.get(field),
                    before == null ? null : String.valueOf(before), after == null ? null : String.valueOf(after)));
        }
    }

    private static Object shortPair(ValueChange c) {
        List<String> pair = new ArrayList<>(2);
        pair.add(cut(c.before()));
        pair.add(cut(c.after()));
        return pair;
    }

    private static String cut(String value) {
        return value == null || value.length() <= 200 ? value : value.substring(0, 200) + "…";
    }

    private static String blockText(Set<Long> blocks, Map<Long, String> codes) {
        return blocks.isEmpty() ? "All Blocks"
                : TermDifferences.codes(blocks.stream().map(codes::get).filter(Objects::nonNull).toList());
    }

    private static Map<String, Object> timelineValues(TermPlan.Timeline t) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("publishAt", t.publishAt());
        v.put("requestsOpenAt", t.requestsOpenAt());
        v.put("requestsCloseAt", t.requestsCloseAt());
        v.put("decisionsDueAt", t.decisionsDueAt());
        v.put("reconciliationDueAt", t.reconciliationDueAt());
        v.put("feesIssueAt", t.feesIssueAt());
        v.put("feesDueAt", t.feesDueAt());
        v.put("registrationOpensAt", t.registrationOpensAt());
        v.put("registrationClosesAt", t.registrationClosesAt());
        v.put("resultsPublishedAt", t.resultsPublishedAt());
        v.put("roommateHours", t.roommateHours());
        v.put("depositHours", t.depositHours());
        v.put("balanceDueAt", t.balanceDueAt());
        v.put("checkInStart", t.checkInStart());
        v.put("checkInEnd", t.checkInEnd());
        v.put("checkOutBy", t.checkOutBy());
        return v;
    }

    private static boolean passed(Object value, Instant now) {
        if (value instanceof Instant i) {
            return !i.isAfter(now);
        }
        if (value instanceof LocalDate d) {
            return !d.isAfter(today(now));
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static int compare(Object a, Object b) {
        return ((Comparable<Object>) a).compareTo(b);
    }

    private static void checkGeneral(String name, LocalDate stayStart, LocalDate stayEnd, FieldErrors errors) {
        errors.check(name != null && name.length() <= 100, "name", "Enter the Term name in at most 100 characters.");
        errors.check(stayStart != null, "stayStart", "Enter the first day of the stay.");
        errors.check(stayEnd != null, "stayEnd", "Enter the last day of the stay.");
        if (stayStart != null && stayEnd != null) {
            errors.check(stayStart.isBefore(stayEnd), "stayEnd", "The stay must end after it starts.");
        }
    }

    private static String stepOf(String field) {
        if (GENERAL_FIELDS.contains(field)) {
            return "general";
        }
        if (TIMELINE_FIELDS.contains(field)) {
            return "timeline";
        }
        if (INFORMATION_FIELDS.contains(field)) {
            return "information";
        }
        return ROOM_FIELDS.contains(field) ? "rooms" : "prices";
    }

    private Optional<TermDrafts.Term> previousTerm(LocalDate stayStart, Long exceptId) {
        if (stayStart == null) {
            return Optional.empty();
        }
        return jdbc.sql("""
                SELECT id FROM cfg_term WHERE status <> 'DRAFT' AND stay_start < :start AND id <> :except
                ORDER BY stay_start DESC LIMIT 1
                """)
                .param("start", stayStart).param("except", exceptId == null ? -1L : exceptId)
                .query(Long.class).optional().flatMap(drafts::find);
    }

    private boolean invoicesExist(long termId) {
        TermInvoices port = invoices.getIfAvailable();
        return port != null && port.anyIssued(termId);
    }

    /** The items the Term offers: every one when {@code offer} is empty. */
    private static <T> List<T> offered(List<T> items, Set<Long> offer, Function<T, Long> id) {
        return offer.isEmpty() ? items : items.stream().filter(x -> offer.contains(id.apply(x))).toList();
    }

    /** Ids of a proposal that still exist, empty when none. */
    private static Set<Long> ids(List<String> values, Set<Long> known) {
        Set<Long> out = new LinkedHashSet<>();
        (values == null ? List.<String>of() : values).forEach(v -> {
            Long value = id(v);
            if (value != null && known.contains(value)) {
                out.add(value);
            }
        });
        return out;
    }

    /** The ids ticked; empty (= every active one, so new ones join) when all are ticked. */
    private static Set<Long> offerIds(List<String> values, Set<Long> active, String field, String message,
            FieldErrors errors) {
        if (values == null) {
            return new LinkedHashSet<>();
        }
        Set<Long> out = new java.util.TreeSet<>();
        values.forEach(v -> {
            Long value = id(v);
            if (value != null && active.contains(value)) {
                out.add(value);
            }
        });
        errors.check(!out.isEmpty(), field, message);
        return out.containsAll(active) ? new LinkedHashSet<>() : out;
    }

    private static String offerText(Set<Long> ids, Map<Long, String> names, String all) {
        return ids.isEmpty() ? all : names.entrySet().stream().filter(e -> ids.contains(e.getKey()))
                .map(Map.Entry::getValue).collect(Collectors.joining(", "));
    }

    private List<Catalog.RoomTypeInfo> activeTypes() {
        return catalog.roomTypes().stream().filter(Catalog.RoomTypeInfo::active).toList();
    }

    private List<Catalog.RoomClassInfo> activeClasses() {
        return catalog.roomClasses().stream().filter(Catalog.RoomClassInfo::active).toList();
    }

    private Map<Long, String> typeNames() {
        Map<Long, String> names = new LinkedHashMap<>();
        catalog.roomTypes().forEach(t -> names.put(t.id(), t.name()));
        return names;
    }

    private Map<Long, String> classNames() {
        Map<Long, String> names = new LinkedHashMap<>();
        catalog.roomClasses().forEach(c -> names.put(c.id(), c.name()));
        return names;
    }

    private static int order(Map<Long, String> names, String id) {
        int i = 0;
        for (Long key : names.keySet()) {
            if (String.valueOf(key).equals(id)) {
                return i;
            }
            i++;
        }
        return i;
    }

    private String statusLabel(TermDrafts.Term t, Instant now) {
        LocalDate today = today(now);
        TermPlan.Timeline v = t.timeline();
        if (v.registrationOpensAt() != null && v.registrationClosesAt() != null && !now.isBefore(v.registrationOpensAt())
                && now.isBefore(v.registrationClosesAt())) {
            return "Registration open";
        }
        if (today.isAfter(t.stayEnd())) {
            return "Closed";
        }
        return today.isBefore(t.stayStart()) ? "Published" : "In stay";
    }

    private static String approver(String code) {
        return switch (code) {
            case "SYSTEM" -> "System";
            case "STAFF" -> "Staff";
            case "MANAGER" -> "Manager";
            default -> "Admin";
        };
    }

    private static int percent(BigDecimal fraction) {
        return fraction.movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValue();
    }

    private static LocalDate today(Instant now) {
        return LocalDate.ofInstant(now, TimeConfig.CAMPUS_ZONE);
    }

    private static String text(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static Long id(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.valueOf(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
