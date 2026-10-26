package vn.fpt.campusstay.service.request;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.assignment.Moves;
import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.setting.Lookups;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.setting.UtilityPolicy;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.event.RoomChangeDecided;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.dto.PageQuery;

/**
 * Room-Change Requests: a checked-in student asks for another Room (same kind,
 * another Room Class or another Room Type); Staff of the Block approve with a
 * free matching Bed or reject with a reason. Approval moves the student and
 * invoices (or credits) the price difference for the days left.
 */
@Service
public class RoomChangeService {

    public record CurrentRoom(String room, String bed, String roomTypeId, String roomTypeName, String roomClassId,
            String roomClassName) {
    }

    public record TypeOption(String id, String name) {
    }

    public record ClassOption(String id, String name, BigDecimal surchargeRate) {
    }

    public record PriceOption(String roomTypeId, String roomClassId, long termPrice) {
    }

    public record Options(CurrentRoom currentRoom, List<TypeOption> roomTypes, List<ClassOption> roomClasses,
            List<PriceOption> prices, long remainingDays, long termDays, List<String> reasons, boolean hasOpenRequest) {
    }

    /** @param kind {@code same}, {@code class} or {@code type} */
    public record CreateCommand(Long termId, String kind, Long roomTypeId, Long roomClassId, String reason,
            String details) {
    }

    public record Created(String id) {
    }

    public record From(String room, String bed, String roomTypeName, String roomClassName) {
    }

    public record To(String roomTypeName, String roomClassName) {
    }

    public record Decision(String by, Instant at, String bed, String reason, String note) {
    }

    public record QueueItem(String id, String studentName, String studentCode, String kind, From from, To to,
            String reason, long difference, Instant submittedAt, String status, Decision decision) {
    }

    public record QueuePage(List<QueueItem> items, long total, List<String> rejectReasons) {
    }

    public record MatchingBed(String bedId, int floor, int roommates) {
    }

    public record MatchingBeds(List<MatchingBed> items) {
    }

    public record Decided(String note) {
    }

    /** One line of the student's requests screen ({@code kind=room-changes}). */
    public record StudentItem(String id, String typeLabel, String summary, Instant submittedAt, String status,
            StudentDecision decision, String invoiceId, String invitationId) {
    }

    public record StudentDecision(String note, Instant at) {
    }

    record Request(long id, String code, long termId, long studentId, long allocationId, long buildingId, String kind,
            long typeId, long classId, String reason, String details, long difference, String status, Long targetBedId,
            Long decidedBy, Instant decidedAt, String decisionReason, String decisionNote, Long invoiceId,
            Instant submittedAt) {

        boolean open() {
            return status.equals("SUBMITTED") || status.equals("PENDING");
        }
    }

    private static final Map<String, String> KINDS = Map.of("same", "SAME", "class", "CLASS", "type", "TYPE");
    private static final Map<String, String> STATUSES = Map.of("SUBMITTED", "Pending", "PENDING", "Pending",
            "APPROVED", "Approved", "REJECTED", "Rejected", "CANCELLED", "Cancelled");

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final TermCatalog terms;
    private final Catalog catalog;
    private final FeePolicy fees;
    private final UtilityPolicy utility;
    private final Lookups lookups;
    private final Moves moves;
    private final Residences residences;
    private final Inventory inventory;
    private final UserDirectory users;
    private final Billing billing;
    private final ChangePrices prices;
    private final RoutingService routing;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public RoomChangeService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, TermCatalog terms,
            Catalog catalog, FeePolicy fees, UtilityPolicy utility, Lookups lookups, Moves moves, Residences residences,
            Inventory inventory, UserDirectory users, Billing billing, ChangePrices prices, RoutingService routing,
            ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.terms = terms;
        this.catalog = catalog;
        this.fees = fees;
        this.utility = utility;
        this.lookups = lookups;
        this.moves = moves;
        this.residences = residences;
        this.inventory = inventory;
        this.users = users;
        this.billing = billing;
        this.prices = prices;
        this.routing = routing;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- student

    @Transactional(readOnly = true)
    public Options options(Long termId) {
        long me = currentUser.require(Role.STUDENT).userId();
        TermSummary term = studentTerm(me, termId);
        Optional<Moves.Placement> placement = moves.current(me, term.id());
        Names names = names();
        CurrentRoom room = placement.map(p -> new CurrentRoom(p.room(), p.bed(), String.valueOf(p.roomTypeId()),
                names.type(p.roomTypeId()), String.valueOf(p.roomClassId()), names.roomClass(p.roomClassId())))
                .orElse(null);
        List<Catalog.RoomTypeInfo> types = catalog.roomTypes().stream().filter(Catalog.RoomTypeInfo::active).toList();
        List<Catalog.RoomClassInfo> classes = catalog.roomClasses().stream().filter(Catalog.RoomClassInfo::active)
                .toList();
        List<PriceOption> priceList = new ArrayList<>();
        for (Catalog.RoomTypeInfo t : types) {
            for (Catalog.RoomClassInfo c : classes) {
                OptionalLong price = fees.termPrice(term.id(), t.id(), c.id());
                if (price.isPresent()) {
                    priceList.add(new PriceOption(String.valueOf(t.id()), String.valueOf(c.id()), price.getAsLong()));
                }
            }
        }
        ChangePrices.Days days = prices.days(term);
        return new Options(room,
                types.stream().map(t -> new TypeOption(String.valueOf(t.id()), t.name())).toList(),
                classes.stream().map(c -> new ClassOption(String.valueOf(c.id()), c.name(), c.surchargeRate())).toList(),
                priceList, days.remaining(), days.term(), labels("ROOM_CHANGE_REASON"), openRequest(me, term.id()));
    }

    @Transactional
    public Created create(CreateCommand cmd) {
        long me = currentUser.require(Role.STUDENT).userId();
        TermSummary term = studentTerm(me, cmd.termId());
        Moves.Placement p = moves.current(me, term.id()).filter(x -> x.residentAt() != null)
                .orElseThrow(() -> ApiException.conflict("NOT_CHECKED_IN",
                        "You can ask for a room change once you have checked in."));
        if (utility.blockChangesWhenOverdue() && billing.hasOverdueInvoice(me)) {
            throw ApiException.conflict("OVERDUE_INVOICE", "Pay your overdue Invoice before you ask for a room change.");
        }
        FieldErrors errors = new FieldErrors();
        String kind = cmd.kind() == null ? null : KINDS.get(cmd.kind().trim().toLowerCase(Locale.ROOT));
        errors.check(kind != null, "kind", "Choose the kind of change.");
        long typeId = p.roomTypeId();
        long classId = p.roomClassId();
        if ("CLASS".equals(kind)) {
            errors.check(cmd.roomClassId() != null && cmd.roomClassId() != p.roomClassId(), "roomClassId",
                    "Choose a Room Class other than your current one.");
            classId = cmd.roomClassId() == null ? classId : cmd.roomClassId();
        } else if ("TYPE".equals(kind)) {
            errors.check(cmd.roomTypeId() != null && cmd.roomTypeId() != p.roomTypeId(), "roomTypeId",
                    "Choose a Room Type other than your current one.");
            typeId = cmd.roomTypeId() == null ? typeId : cmd.roomTypeId();
            classId = cmd.roomClassId() == null ? classId : cmd.roomClassId();
        }
        String reason = lookups.find("ROOM_CHANGE_REASON", cmd.reason() == null ? "" : cmd.reason().trim())
                .map(Lookups.Lookup::code).orElse(null);
        errors.check(reason != null, "reason", "Choose a reason.");
        String details = cmd.details() == null || cmd.details().isBlank() ? null : cmd.details().trim();
        errors.check(details == null || details.length() <= 1000, "details", "Keep the details under 1,000 characters.");
        errors.throwIfAny();
        long newPrice = fees.termPrice(term.id(), typeId, classId)
                .orElseThrow(() -> FieldErrors.single("roomTypeId", "This Room Type and Room Class are not offered."));
        long currentPrice = fees.termPrice(p.termId(), p.roomTypeId(), p.roomClassId()).orElse(newPrice);
        long difference = prices.difference(newPrice, currentPrice, term);
        Instant now = Instant.now(clock);
        Instant slaDue = now.plus(Duration.ofHours(routing.sla(p.buildingId()).roomChange()));
        Long assignee = routing.route("ROOM_CHANGE", p.buildingId(), null).orElse(null);
        try {
            return new Created(jdbc.sql("""
                    WITH next AS (SELECT nextval(pg_get_serial_sequence('req_room_change', 'id')) AS id)
                    INSERT INTO req_room_change (id, code, term_id, student_id, allocation_id, building_id, kind,
                                                 target_room_type_id, target_room_class_id, reason_code, details,
                                                 price_difference, assignee_id, sla_due_at, submitted_at)
                    OVERRIDING SYSTEM VALUE
                    SELECT id, 'RC-' || :termCode || '-' || lpad(id::text, greatest(6, length(id::text)), '0'), :term,
                           :student, :allocation, :building, :kind, :type, :class, :reason, :details, :difference,
                           :assignee, :sla, :now
                    FROM next
                    RETURNING code
                    """)
                    .param("termCode", term.code()).param("term", term.id()).param("student", me)
                    .param("allocation", p.allocationId()).param("building", p.buildingId()).param("kind", kind)
                    .param("type", typeId).param("class", classId).param("reason", reason).param("details", details)
                    .param("difference", difference).param("assignee", assignee).param("sla", Timestamp.from(slaDue))
                    .param("now", Timestamp.from(now))
                    .query(String.class).single());
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("OPEN_REQUEST", "You already have an open Room-Change Request for this Term.");
        }
    }

    /** The student's Room-Change Requests for the requests screen, newest first. */
    @Transactional(readOnly = true)
    public List<StudentItem> ofStudent(long studentId, Long termId) {
        List<Request> rows = jdbc.sql("SELECT * FROM req_room_change WHERE student_id = :s"
                + (termId != null ? " AND term_id = :t" : "") + " ORDER BY submitted_at DESC, id DESC")
                .params(termId != null ? Map.of("s", studentId, "t", termId) : Map.of("s", studentId))
                .query(RoomChangeService::request).list();
        Map<Long, Billing.InvoiceLine> invoices = billing.invoices(rows.stream().map(Request::invoiceId)
                .filter(Objects::nonNull).toList());
        Map<Long, Moves.Placement> from = moves.placements(rows.stream().map(Request::allocationId).toList());
        Names names = names();
        return rows.stream().map(r -> {
            Moves.Placement p = from.get(r.allocationId());
            String current = p == null ? "" : names.type(p.roomTypeId()) + " · " + names.roomClass(p.roomClassId()) + " → ";
            Billing.InvoiceLine invoice = r.invoiceId() == null ? null : invoices.get(r.invoiceId());
            boolean payable = invoice != null && !invoice.status().equals("Paid") && !invoice.status().equals("Void");
            return new StudentItem(r.code(), "Room change", r.kind().equals("SAME")
                    ? "Another Room · " + names.type(r.typeId()) + " · " + names.roomClass(r.classId())
                    : current + names.type(r.typeId()) + " · " + names.roomClass(r.classId()),
                    r.submittedAt(), STATUSES.get(r.status()),
                    r.decidedAt() == null ? null : new StudentDecision(decisionText(r), r.decidedAt()),
                    payable ? invoice.code() : null, null);
        }).toList();
    }

    // ---------------------------------------------------------------- Staff

    /** @param status Pending, Approved, Rejected or Cancelled; {@code kind} same, class or type */
    @Transactional(readOnly = true)
    public QueuePage queue(Long termId, String block, String status, String kind, PageQuery page) {
        Set<Long> scope = blockScope.resolve(block).ids();
        TermSummary term = term(termId);
        Map<String, Object> params = new HashMap<>();
        params.put("term", term.id());
        params.put("scope", List.copyOf(scope));
        StringBuilder where = new StringBuilder(" WHERE term_id = :term AND building_id IN (:scope)");
        if (status != null && !status.isBlank()) {
            List<String> codes = STATUSES.entrySet().stream().filter(e -> e.getValue().equalsIgnoreCase(status.trim()))
                    .map(Map.Entry::getKey).toList();
            if (codes.isEmpty()) {
                throw FieldErrors.single("status", "Choose Pending, Approved, Rejected or Cancelled.");
            }
            where.append(" AND status IN (:statuses)");
            params.put("statuses", codes);
        }
        if (kind != null && !kind.isBlank()) {
            String code = KINDS.get(kind.trim().toLowerCase(Locale.ROOT));
            if (code == null) {
                throw FieldErrors.single("kind", "Choose same, class or type.");
            }
            where.append(" AND kind = :kind");
            params.put("kind", code);
        }
        long total = jdbc.sql("SELECT count(*) FROM req_room_change" + where).params(params).query(Long.class).single();
        params.put("limit", page.limit());
        params.put("offset", page.offset());
        List<Request> rows = jdbc.sql("SELECT * FROM req_room_change" + where + """
                 ORDER BY (status IN ('SUBMITTED', 'PENDING')) DESC, sla_due_at NULLS LAST, submitted_at DESC, id DESC
                 LIMIT :limit OFFSET :offset
                """).params(params).query(RoomChangeService::request).list();
        Map<Long, UserDirectory.Student> students = users.students(rows.stream().map(Request::studentId).toList());
        Map<Long, String> deciders = users.displayNames(rows.stream().map(Request::decidedBy).filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        Map<Long, Moves.Placement> from = moves.placements(rows.stream().map(Request::allocationId).toList());
        Map<Long, Inventory.BedSlot> beds = inventory.beds(rows.stream().map(Request::targetBedId)
                .filter(Objects::nonNull).toList());
        Names names = names();
        List<QueueItem> items = rows.stream().map(r -> {
            UserDirectory.Student s = students.get(r.studentId());
            Moves.Placement p = from.get(r.allocationId());
            Inventory.BedSlot bed = r.targetBedId() == null ? null : beds.get(r.targetBedId());
            return new QueueItem(r.code(), s == null ? null : s.name(), s == null ? null : s.studentCode(),
                    r.kind().toLowerCase(Locale.ROOT),
                    p == null ? null : new From(p.room(), p.bed(), names.type(p.roomTypeId()), names.roomClass(p.roomClassId())),
                    new To(names.type(r.typeId()), names.roomClass(r.classId())),
                    label("ROOM_CHANGE_REASON", r.reason()), r.difference(), r.submittedAt(), STATUSES.get(r.status()),
                    r.decidedAt() == null ? null : new Decision(deciders.get(r.decidedBy()), r.decidedAt(),
                            bed == null ? null : bed.code(),
                            r.decisionReason() == null ? null : label("ROOM_CHANGE_REJECT_REASON", r.decisionReason()),
                            r.decisionNote()));
        }).toList();
        return new QueuePage(items, total, labels("ROOM_CHANGE_REJECT_REASON"));
    }

    /** Staff decide moves inside their Blocks; a move to another Block is a Manager's (ADR-19). */
    private static boolean mayMoveInto(AuthenticatedUser user, long buildingId) {
        return !user.is(Role.STAFF) || user.blockIds().contains(buildingId);
    }

    @Transactional(readOnly = true)
    public MatchingBeds matchingBeds(String code) {
        AuthenticatedUser user = currentUser.get();
        Request r = inScope(code, false);
        Moves.Placement p = moves.placement(r.allocationId())
                .orElseThrow(() -> ApiException.notFound("This Room-Change Request does not exist."));
        return new MatchingBeds(moves.freeBeds(r.termId(), p.gender(), r.typeId(), r.classId()).stream()
                .filter(b -> b.roomId() != p.roomId() && mayMoveInto(user, b.buildingId()))
                .limit(50).map(b -> new MatchingBed(b.code(), b.floor(), b.roommates())).toList());
    }

    /** Approve with {@code bedId} (the Bed code, or its numeric id), or reject with a reason and an optional message. */
    @Transactional
    public Decided decide(String code, String decision, String bedId, String reason, String message) {
        AuthenticatedUser user = currentUser.require(Permission.DECIDE_ROOM_CHANGES);
        Request r = inScope(code, true);
        if (!r.open()) {
            throw ApiException.conflict("ALREADY_DECIDED", "This request was already decided.");
        }
        Instant now = Instant.now(clock);
        String student = Optional.ofNullable(users.students(List.of(r.studentId())).get(r.studentId()))
                .map(UserDirectory.Student::name).orElse("The student");
        if ("rejected".equalsIgnoreCase(decision == null ? "" : decision.trim())) {
            String reasonCode = lookups.find("ROOM_CHANGE_REJECT_REASON", reason == null ? "" : reason.trim())
                    .map(Lookups.Lookup::code)
                    .orElseThrow(() -> FieldErrors.single("reason", "Choose why the request is rejected."));
            String note = message == null || message.isBlank() ? null : message.trim();
            jdbc.sql("""
                    UPDATE req_room_change SET status = 'REJECTED', decided_by = :by, decided_at = :now,
                           decision_reason = :reason, decision_note = :note, version = version + 1
                    WHERE id = :id
                    """).param("by", user.userId()).param("now", Timestamp.from(now)).param("reason", reasonCode)
                    .param("note", note).param("id", r.id()).update();
            String text = "Rejected: " + label("ROOM_CHANGE_REJECT_REASON", reasonCode) + ".";
            audit.record("ROOM_CHANGE_REJECTED", AuditLog.Tone.WARNING, "Room-Change Request", r.id(), r.code(),
                    Map.of("reason", label("ROOM_CHANGE_REJECT_REASON", reasonCode)));
            events.publishEvent(new RoomChangeDecided(r.id(), r.code(), r.studentId(), "rejected", text));
            return new Decided(text);
        }
        if (!"approved".equalsIgnoreCase(decision == null ? "" : decision.trim())) {
            throw FieldErrors.single("decision", "Choose Approved or Rejected.");
        }
        if (bedId == null || bedId.isBlank()) {
            throw FieldErrors.single("bedId", "Choose a Bed.");
        }
        Moves.Placement p = moves.placement(r.allocationId()).filter(Moves.Placement::active)
                .orElseThrow(() -> ApiException.conflict("ALLOCATION_ENDED",
                        student + " no longer holds the Bed this request was made from."));
        Moves.FreeBed bed = moves.freeBeds(r.termId(), p.gender(), r.typeId(), r.classId()).stream()
                .filter(b -> b.code().equalsIgnoreCase(bedId.trim()) || String.valueOf(b.bedId()).equals(bedId.trim()))
                .findFirst()
                .orElseThrow(() -> ApiException.conflict("BED_NOT_AVAILABLE",
                        "This Bed is not free for this request any more. Choose another one."));
        if (!mayMoveInto(user, bed.buildingId())) {
            throw ApiException.forbidden("CROSS_BLOCK", "A move to another Block is decided by a Manager.");
        }
        long newAllocation = moves.move(r.allocationId(), bed.bedId(), "ROOM_CHANGE", user.userId());
        TermSummary term = terms.findPublished(r.termId()).orElseThrow();
        long newPrice = fees.termPrice(r.termId(), r.typeId(), r.classId()).orElse(0);
        long currentPrice = fees.termPrice(p.termId(), p.roomTypeId(), p.roomClassId()).orElse(newPrice);
        long difference = prices.difference(newPrice, currentPrice, term);
        NumberFormat vnd = NumberFormat.getIntegerInstance(Locale.US);
        StringBuilder text = new StringBuilder("Moved to Room " + bed.room() + " · Bed " + bed.bed() + ".");
        Long invoiceId = null;
        if (difference > 0) {
            Billing.IssuedInvoice invoice = billing.issueCharge(new Billing.ChargeRequest(r.termId(), r.studentId(),
                    newAllocation, bed.buildingId(), "ROOM_CHANGE", "Room change",
                    difference, List.of(new Billing.ChargeLine("Room change to Room " + bed.room() + " for the days left",
                            difference)),
                    now.plus(Duration.ofDays(fees.balanceDays())), "Room change " + r.code()));
            invoiceId = invoice.id();
            text.append(" Invoice ").append(invoice.code()).append(" of ").append(vnd.format(difference)).append(" VND.");
        } else if (difference < 0) {
            billing.requestCredit(r.termId(), r.studentId(), bed.buildingId(), "ROOM_CHANGE", r.id(),
                    "Room change " + r.code() + " · cheaper Room", -difference);
            text.append(" A refund of ").append(vnd.format(-difference))
                    .append(" VND goes to a Manager for approval.");
        }
        jdbc.sql("""
                UPDATE req_room_change SET status = 'APPROVED', target_bed_id = :bed, decided_by = :by, decided_at = :now,
                       price_difference = :difference, invoice_id = :invoice, decision_note = :note, version = version + 1
                WHERE id = :id
                """).param("bed", bed.bedId()).param("by", user.userId()).param("now", Timestamp.from(now))
                .param("difference", difference).param("invoice", invoiceId).param("note", text.toString())
                .param("id", r.id()).update();
        audit.record("ROOM_CHANGE_APPROVED", AuditLog.Tone.SUCCESS, "Room-Change Request", r.id(), r.code(),
                Map.of("bed", bed.code(), "difference", difference));
        events.publishEvent(new RoomChangeDecided(r.id(), r.code(), r.studentId(), "approved", text.toString()));
        return new Decided(text.toString());
    }

    // ---------------------------------------------------------------- helpers

    private Request inScope(String code, boolean lock) {
        Set<Long> scope = blockScope.resolve(null).ids();
        Request r = find(code, lock).orElseThrow(() -> ApiException.notFound("This Room-Change Request does not exist."));
        if (!scope.contains(r.buildingId())) {
            throw ApiException.forbidden("BLOCK_OUT_OF_SCOPE", "You do not have access to this Block.");
        }
        return r;
    }

    private Optional<Request> find(String code, boolean lock) {
        if (code == null || code.isBlank() || code.length() > 24) {
            return Optional.empty();
        }
        String value = code.trim();
        boolean numeric = value.chars().allMatch(Character::isDigit);
        return jdbc.sql("SELECT * FROM req_room_change WHERE " + (numeric ? "id = :v" : "upper(code) = upper(:v)")
                + (lock ? " FOR UPDATE" : ""))
                .param("v", numeric ? (Object) Long.parseLong(value) : value).query(RoomChangeService::request).optional();
    }

    private boolean openRequest(long studentId, long termId) {
        return jdbc.sql("""
                SELECT count(*) FROM req_room_change
                WHERE student_id = :s AND term_id = :t AND status IN ('SUBMITTED', 'PENDING')
                """).param("s", studentId).param("t", termId).query(Long.class).single() > 0;
    }

    private String decisionText(Request r) {
        if (r.status().equals("REJECTED")) {
            return "Rejected: " + label("ROOM_CHANGE_REJECT_REASON", r.decisionReason()) + "."
                    + (r.decisionNote() == null ? "" : " " + r.decisionNote());
        }
        return r.decisionNote();
    }

    /** The Term of the student's Bed, else the given or current one. */
    private TermSummary studentTerm(long studentId, Long termId) {
        if (termId != null) {
            return terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        }
        return residences.current(studentId).flatMap(r -> terms.findPublished(r.termId())).orElseGet(() -> term(null));
    }

    private TermSummary term(Long termId) {
        if (termId != null) {
            return terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        }
        return terms.publishedTerms().stream().filter(TermSummary::current).findFirst()
                .or(terms::openForRegistration)
                .orElseThrow(() -> ApiException.notFound("No Term is published yet."));
    }

    private List<String> labels(String listKey) {
        return lookups.list(listKey).stream().map(Lookups.Lookup::label).toList();
    }

    private String label(String listKey, String code) {
        return code == null ? null : lookups.find(listKey, code).map(Lookups.Lookup::label).orElse(code);
    }

    record Names(Map<Long, String> types, Map<Long, String> classes) {

        String type(long id) {
            return types.get(id);
        }

        String roomClass(long id) {
            return classes.get(id);
        }
    }

    Names names() {
        return new Names(
                catalog.roomTypes().stream().collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name)),
                catalog.roomClasses().stream()
                        .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name)));
    }

    private static Request request(ResultSet rs, int i) throws SQLException {
        return new Request(rs.getLong("id"), rs.getString("code"), rs.getLong("term_id"), rs.getLong("student_id"),
                rs.getLong("allocation_id"), rs.getLong("building_id"), rs.getString("kind"),
                rs.getLong("target_room_type_id"), rs.getLong("target_room_class_id"), rs.getString("reason_code"),
                rs.getString("details"), rs.getLong("price_difference"), rs.getString("status"),
                rs.getObject("target_bed_id", Long.class), rs.getObject("decided_by", Long.class),
                instant(rs, "decided_at"), rs.getString("decision_reason"), rs.getString("decision_note"),
                rs.getObject("invoice_id", Long.class), instant(rs, "submitted_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
