package vn.fpt.campusstay.service.request;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
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

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.event.RoomChangeDecided;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.assignment.Moves;
import vn.fpt.campusstay.service.assignment.Stays;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.setting.Lookups;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.service.setting.UtilityPolicy;

/**
 * Next-Term Room-Change Requests (spec §6.10, D-10, D-14): during the requests window a continuing resident asks for
 * another Room (same kind, another Room Class or another Room Type, any Block); Staff of the Block decide a move inside
 * it and a Manager one to another Block, picking the target Bed (students never pick one, ADR-6), or reject with a
 * reason. Approval moves the student's next-Term Allocation; the next Term is billed on that Bed, so no price
 * difference ever arises. Decisions are due by M4 and possible until the next-Term fees are issued.
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

    /** @param termPrice the next Term's price per Bed (the next-Term fee of such a Bed) */
    public record PriceOption(String roomTypeId, String roomClassId, long termPrice) {
    }

    /** The requests window the request belongs to. */
    public record Window(String termId, String termName, Instant closesAt, Instant decisionsDueAt) {
    }

    /**
     * @param currentRoom your next-Term Bed (its Room Class in the next Term)
     * @param canAsk      the window is open, you continue next Term and have no open request
     * @param unavailable why you cannot ask now, null when you can
     */
    public record Options(CurrentRoom currentRoom, List<TypeOption> roomTypes, List<ClassOption> roomClasses,
            List<PriceOption> prices, Window window, List<String> reasons, boolean hasOpenRequest, boolean canAsk,
            String unavailable) {
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

    /** @param dueAt the decision deadline (M4 of the window) */
    public record QueueItem(String id, String studentName, String studentCode, String kind, From from, To to,
            String reason, Instant submittedAt, Instant dueAt, String status, Decision decision) {
    }

    public record QueuePage(List<QueueItem> items, long total, List<String> rejectReasons, Window window) {
    }

    public record MatchingBed(String bedId, int floor, int roommates) {
    }

    /** @param note why no Bed is offered (the share kept for new students), else null */
    public record MatchingBeds(List<MatchingBed> items, String note) {
    }

    public record Decided(String note) {
    }

    /**
     * One line of the student's requests screen ({@code kind=room-changes}).
     *
     * @param invitationId a swap invitation the student can answer
     * @param consentId    a Room Class change the student is asked to consent to
     */
    public record StudentItem(String id, String typeLabel, String summary, Instant submittedAt, String status,
            StudentDecision decision, String invoiceId, String invitationId, String consentId) {
    }

    public record StudentDecision(String note, Instant at) {
    }

    record Request(long id, String code, long termId, long studentId, long allocationId, long buildingId, String kind,
            long typeId, long classId, String reason, String details, String status, Long targetBedId,
            Long decidedBy, Instant decidedAt, String decisionReason, String decisionNote, Instant submittedAt,
            Instant dueAt) {

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
    private final Inventory inventory;
    private final UserDirectory users;
    private final Billing billing;
    private final NextTermContext context;
    private final RoutingService routing;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public RoomChangeService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, TermCatalog terms,
            Catalog catalog, FeePolicy fees, UtilityPolicy utility, Lookups lookups, Moves moves, Inventory inventory,
            UserDirectory users, Billing billing, NextTermContext context, RoutingService routing,
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
        this.inventory = inventory;
        this.users = users;
        this.billing = billing;
        this.context = context;
        this.routing = routing;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- student

    @Transactional(readOnly = true)
    public Options options(Long termId) {
        long me = currentUser.require(Role.STUDENT).userId();
        List<Catalog.RoomTypeInfo> types = catalog.roomTypes().stream().filter(Catalog.RoomTypeInfo::active).toList();
        List<Catalog.RoomClassInfo> classes = catalog.roomClasses().stream().filter(Catalog.RoomClassInfo::active)
                .toList();
        List<TypeOption> typeOptions = types.stream().map(t -> new TypeOption(String.valueOf(t.id()), t.name())).toList();
        List<ClassOption> classOptions = classes.stream()
                .map(c -> new ClassOption(String.valueOf(c.id()), c.name(), c.surchargeRate())).toList();
        Optional<NextTermContext.Filing> filing = context.of(me)
                .filter(f -> termId == null || f.window().termId() == termId);
        if (filing.isEmpty()) {
            return new Options(null, typeOptions, classOptions, List.of(), null, labels("ROOM_CHANGE_REASON"), false,
                    false, "Room changes are asked for the next Term, while its requests window is open and your Bed is"
                            + " kept for it.");
        }
        NextTermContext.Filing f = filing.get();
        Moves.Placement p = f.placement();
        Names names = names();
        CurrentRoom room = new CurrentRoom(p.room(), p.bed(), String.valueOf(p.roomTypeId()), names.type(p.roomTypeId()),
                String.valueOf(p.roomClassId()), names.roomClass(p.roomClassId()));
        List<PriceOption> priceList = new ArrayList<>();
        for (Catalog.RoomTypeInfo t : types) {
            for (Catalog.RoomClassInfo c : classes) {
                OptionalLong price = fees.termPrice(f.window().termId(), t.id(), c.id());
                if (price.isPresent()) {
                    priceList.add(new PriceOption(String.valueOf(t.id()), String.valueOf(c.id()), price.getAsLong()));
                }
            }
        }
        boolean open = openRequest(me, f.window().termId());
        boolean filingNow = f.window().filing(Instant.now(clock));
        String unavailable = !filingNow ? "Next-Term requests closed on " + NextTermContext.when(f.window().closesAt()) + "."
                : !f.nextTerm().continuing() ? "This is the last Term of your stay: ask for an extension first."
                : open ? "You already have an open room change request." : null;
        return new Options(room, typeOptions, classOptions, priceList, window(f.window()), labels("ROOM_CHANGE_REASON"),
                open, unavailable == null, unavailable);
    }

    @Transactional
    public Created create(CreateCommand cmd) {
        long me = currentUser.require(Role.STUDENT).userId();
        NextTermContext.Filing f = context.filing(me);
        if (cmd.termId() != null && cmd.termId() != f.window().termId()) {
            throw FieldErrors.single("termId", "Room changes are asked for " + f.window().termName() + ".");
        }
        if (!f.nextTerm().continuing()) {
            throw ApiException.conflict("EXTEND_FIRST", "This is the last Term of your stay: ask for an extension first.");
        }
        Moves.Placement p = f.placement();
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
        if (fees.termPrice(f.window().termId(), typeId, classId).isEmpty()) {
            throw FieldErrors.single("roomTypeId", "This Room Type and Room Class are not offered.");
        }
        Instant now = Instant.now(clock);
        Long assignee = routing.route("ROOM_CHANGE", p.buildingId(), null).orElse(null);
        try {
            return new Created(jdbc.sql("""
                    WITH next AS (SELECT nextval(pg_get_serial_sequence('req_room_change', 'id')) AS id)
                    INSERT INTO req_room_change (id, code, term_id, student_id, allocation_id, building_id, kind,
                                                 target_room_type_id, target_room_class_id, reason_code, details,
                                                 price_difference, assignee_id, sla_due_at, submitted_at)
                    OVERRIDING SYSTEM VALUE
                    SELECT id, 'RC-' || :termCode || '-' || lpad(id::text, greatest(6, length(id::text)), '0'), :term,
                           :student, :allocation, :building, :kind, :type, :class, :reason, :details, 0,
                           :assignee, :sla, :now
                    FROM next
                    RETURNING code
                    """)
                    .param("termCode", f.window().termCode()).param("term", f.window().termId()).param("student", me)
                    .param("allocation", p.allocationId()).param("building", p.buildingId()).param("kind", kind)
                    .param("type", typeId).param("class", classId).param("reason", reason).param("details", details)
                    .param("assignee", assignee).param("sla", Timestamp.from(f.window().decisionsDueAt()))
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
        Map<Long, Moves.Placement> from = moves.placements(rows.stream().map(Request::allocationId).toList());
        Map<Long, String> termNames = terms.publishedTerms().stream()
                .collect(Collectors.toMap(TermSummary::id, TermSummary::name));
        Names names = names();
        return rows.stream().map(r -> {
            Moves.Placement p = from.get(r.allocationId());
            String current = p == null ? "" : names.type(p.roomTypeId()) + " · " + names.roomClass(p.roomClassId()) + " → ";
            String term = termNames.getOrDefault(r.termId(), "") + " · ";
            return new StudentItem(r.code(), "Room change", r.kind().equals("SAME")
                    ? term + "Another Room · " + names.type(r.typeId()) + " · " + names.roomClass(r.classId())
                    : term + current + names.type(r.typeId()) + " · " + names.roomClass(r.classId()),
                    r.submittedAt(), STATUSES.get(r.status()),
                    r.decidedAt() == null ? null : new StudentDecision(decisionText(r), r.decidedAt()),
                    null, null, null);
        }).toList();
    }

    // ---------------------------------------------------------------- Staff

    /**
     * @param termId the next Term; null = the latest open requests window
     * @param status Pending, Approved, Rejected or Cancelled; {@code kind} same, class or type
     */
    @Transactional(readOnly = true)
    public QueuePage queue(Long termId, String block, String status, String kind, PageQuery page) {
        Set<Long> scope = blockScope.resolve(block).ids();
        long term = queueTerm(termId);
        Map<String, Object> params = new HashMap<>();
        params.put("term", term);
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
                    label("ROOM_CHANGE_REASON", r.reason()), r.submittedAt(), r.dueAt(), STATUSES.get(r.status()),
                    r.decidedAt() == null ? null : new Decision(deciders.get(r.decidedBy()), r.decidedAt(),
                            bed == null ? null : bed.code(),
                            r.decisionReason() == null ? null : label("ROOM_CHANGE_REJECT_REASON", r.decisionReason()),
                            r.decisionNote()));
        }).toList();
        return new QueuePage(items, total, labels("ROOM_CHANGE_REJECT_REASON"),
                context.window(term).map(RoomChangeService::window).orElse(null));
    }

    /** Staff decide moves inside their Blocks; a move to another Block is a Manager's (ADR-19). */
    static boolean mayMoveInto(AuthenticatedUser user, long buildingId) {
        return !user.is(Role.STAFF) || user.blockIds().contains(buildingId);
    }

    @Transactional(readOnly = true)
    public MatchingBeds matchingBeds(String code) {
        AuthenticatedUser user = currentUser.get();
        Request r = inScope(code, false);
        Moves.Placement p = moves.placement(r.allocationId())
                .orElseThrow(() -> ApiException.notFound("This Room-Change Request does not exist."));
        List<Moves.FreeBed> free = moves.freeBeds(r.termId(), p.gender(), r.typeId(), r.classId());
        if (reservedForNewStudents(r.termId(), p, r.typeId(), r.classId(), free.size())) {
            return new MatchingBeds(List.of(), "The free Beds of this kind are kept for new students.");
        }
        return new MatchingBeds(free.stream()
                .filter(b -> b.roomId() != p.roomId() && mayMoveInto(user, b.buildingId()))
                .limit(50).map(b -> new MatchingBed(b.code(), b.floor(), b.roommates())).toList(), null);
    }

    /**
     * A continuing resident moving into another Room Type × Room Class must leave the share of its Beds kept for new
     * students free (D-29): the move is refused when the free Beds of that kind would fall below it.
     */
    private boolean reservedForNewStudents(long termId, Moves.Placement p, long typeId, long classId, int free) {
        if (p.roomTypeId() == typeId && p.roomClassId() == classId) {
            return false;
        }
        BigDecimal percent = terms.renewal(termId).map(TermCatalog.Renewal::reservedNewPercent).orElse(BigDecimal.ZERO);
        if (percent.signum() <= 0) {
            return false;
        }
        long beds = inventory.assignableBeds(termId).stream().filter(b -> b.gender().equals(p.gender())
                && b.roomTypeId() == typeId && b.roomClassId() == classId).count();
        long reserved = (long) Math.ceil(beds * percent.doubleValue() / 100);
        return free - 1 < reserved;
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
        context.checkDeciding(r.termId());
        Moves.Placement p = moves.placement(r.allocationId()).filter(Moves.Placement::active)
                .orElseThrow(() -> ApiException.conflict("ALLOCATION_ENDED",
                        student + " no longer holds the Bed this request was made from."));
        List<Moves.FreeBed> free = moves.freeBeds(r.termId(), p.gender(), r.typeId(), r.classId());
        Moves.FreeBed bed = free.stream()
                .filter(b -> b.code().equalsIgnoreCase(bedId.trim()) || String.valueOf(b.bedId()).equals(bedId.trim()))
                .findFirst()
                .orElseThrow(() -> ApiException.conflict("BED_NOT_AVAILABLE",
                        "This Bed is not free for this request any more. Choose another one."));
        if (!mayMoveInto(user, bed.buildingId())) {
            throw ApiException.forbidden("CROSS_BLOCK", "A move to another Block is decided by a Manager.");
        }
        if (reservedForNewStudents(r.termId(), p, r.typeId(), r.classId(), free.size())) {
            throw ApiException.conflict("RESERVED_FOR_NEW_STUDENTS",
                    "The free Beds of this kind are kept for new students.");
        }
        moves.move(r.allocationId(), bed.bedId(), "ROOM_CHANGE", user.userId());
        cancelSwapsOf(r.allocationId(), now);
        String termName = terms.findPublished(r.termId()).map(TermSummary::name).orElse("the next Term");
        String text = "In " + termName + " you move to Room " + bed.room() + " · Bed " + bed.bed() + ".";
        jdbc.sql("""
                UPDATE req_room_change SET status = 'APPROVED', target_bed_id = :bed, decided_by = :by, decided_at = :now,
                       decision_note = :note, version = version + 1
                WHERE id = :id
                """).param("bed", bed.bedId()).param("by", user.userId()).param("now", Timestamp.from(now))
                .param("note", text).param("id", r.id()).update();
        audit.record("ROOM_CHANGE_APPROVED", AuditLog.Tone.SUCCESS, "Room-Change Request", r.id(), r.code(),
                Map.of("bed", bed.code(), "term", termName));
        events.publishEvent(new RoomChangeDecided(r.id(), r.code(), r.studentId(), "approved", text));
        return new Decided(text);
    }

    /** A next-Term Allocation was cancelled (Assignment's transaction): its open room change closes. */
    void allocationCancelled(long allocationId, Instant now) {
        jdbc.sql("""
                UPDATE req_room_change SET status = 'CANCELLED', decided_at = :now, version = version + 1,
                       decision_note = 'Cancelled: the Bed for the next Term was released.'
                WHERE allocation_id = :a AND status IN ('SUBMITTED', 'PENDING')
                """).param("now", Timestamp.from(now)).param("a", allocationId).update();
    }

    /** A next-Term Allocation that moved closes the swaps it was part of (their Bed is not that one any more). */
    private void cancelSwapsOf(long allocationId, Instant now) {
        jdbc.sql("""
                UPDATE req_swap SET status = 'CANCELLED', decision_reason = 'The next-Term Bed changed.',
                       decided_at = :now, version = version + 1
                WHERE (a_allocation_id = :a OR b_allocation_id = :a) AND status IN ('INVITED', 'PENDING', 'TO_MANAGER')
                """).param("now", Timestamp.from(now)).param("a", allocationId).update();
        jdbc.sql("UPDATE req_swap_post SET status = 'CLOSED', updated_at = :now WHERE allocation_id = :a AND status = 'ACTIVE'")
                .param("now", Timestamp.from(now)).param("a", allocationId).update();
    }

    // ---------------------------------------------------------------- helpers

    /** The Term a queue shows: the one asked for, else the latest open requests window, else the current Term. */
    long queueTerm(Long termId) {
        if (termId != null) {
            return terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."))
                    .id();
        }
        return context.current().map(Stays.Window::termId)
                .or(() -> terms.publishedTerms().stream().filter(TermSummary::current).findFirst().map(TermSummary::id))
                .orElseThrow(() -> ApiException.notFound("No Term is published yet."));
    }

    static Window window(Stays.Window w) {
        return new Window(String.valueOf(w.termId()), w.termName(), w.closesAt(), w.decisionsDueAt());
    }

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
                rs.getString("details"), rs.getString("status"),
                rs.getObject("target_bed_id", Long.class), rs.getObject("decided_by", Long.class),
                instant(rs, "decided_at"), rs.getString("decision_reason"), rs.getString("decision_note"),
                instant(rs, "submitted_at"), instant(rs, "sla_due_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
