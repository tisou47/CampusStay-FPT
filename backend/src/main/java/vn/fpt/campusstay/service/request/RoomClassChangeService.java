package vn.fpt.campusstay.service.request;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
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

import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.event.NextTermRequestDecided;
import vn.fpt.campusstay.event.RoomClassConsentAsked;
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
import vn.fpt.campusstay.service.inventory.RoomClassChanges;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.FeePolicy;

/**
 * Room Class change of a whole Room for the next Term (D-03, D-04, spec §6.11). A continuing resident (or a Manager,
 * for supply reasons) asks for another class; every other continuing resident of the Room must consent (residents
 * who leave after this Term are not asked; new continuing residents are asked when they arrive). Once all agreed,
 * Staff of the Block check the furniture (an upgrade needs the missing items in the Block store, which are then
 * reserved; a downgrade lists the items to remove) and decide by M4. Approval sets the Room's class from the next Term
 * on: its next-Term fees use it. If the furniture does not match at the start of the Term, a Manager sets the class
 * back; after a fee was paid this is the only price difference ever charged or refunded (§6.11 step 6).
 */
@Service
public class RoomClassChangeService {

    public record ClassOption(String id, String name, Long termPrice) {
    }

    public record Consent(String name, String status) {
    }

    /** @param status {@code Awaiting consent}, {@code Waiting for Staff}, {@code Approved} … */
    public record OpenChange(String id, String status, String toClass, String requestedBy, List<Consent> consents) {
    }

    /**
     * The student's view: their next-Term Room and its class there.
     *
     * @param residents continuing residents of the Room who would have to agree (the student included)
     */
    public record Options(String termId, String termName, String room, String roomType, ClassOption current,
            List<ClassOption> classes, int residents, OpenChange open, boolean canAsk, String unavailable) {
    }

    public record Created(String id, String status) {
    }

    public record Need(String type, String typeVi, int quantity, int available) {
    }

    /** @param enough the Block store holds every missing item */
    public record Furniture(boolean enough, List<Need> missing, List<Need> extra, List<String> reserved,
            List<String> removing) {
    }

    public record Item(String id, String room, String block, String fromClass, String toClass, String requestedBy,
            String requesterRole, int agreed, int asked, String status, Instant submittedAt, Instant dueAt,
            Instant decidedAt) {
    }

    public record ItemPage(List<Item> items, long total, RoomChangeService.Window window) {
    }

    /**
     * @param fromPrice the next Term's price of a Bed of the Room in its current class; {@code toPrice} in the new one
     * @param residents the Room's continuing residents now and their answer ({@code Agreed}, {@code Declined},
     *                  {@code Pending}, or {@code Not asked yet} for one who arrived after the request)
     */
    public record Detail(Item item, String termName, String reason, Long fromPrice, Long toPrice,
            List<Consent> residents, Furniture furniture, String decisionNote, String decidedBy) {
    }

    private record Change(long id, String code, long termId, long roomId, long buildingId, String roomCode,
            long fromClassId, long toClassId, long requestedBy, String requesterRole, String reason, String status,
            Instant dueAt, String furniture, Long decidedBy, Instant decidedAt, String decisionNote,
            Instant submittedAt) {

        boolean open() {
            return status.equals("AWAITING_CONSENT") || status.equals("SUBMITTED");
        }
    }

    private record ConsentRow(long studentId, long allocationId, String status) {
    }

    private static final Map<String, String> STATUSES = Map.of("AWAITING_CONSENT", "Awaiting consent", "SUBMITTED",
            "Waiting for Staff", "APPROVED", "Approved", "REJECTED", "Rejected", "CANCELLED", "Cancelled", "SET_BACK",
            "Set back");
    private static final Map<String, String> CONSENTS = Map.of("PENDING", "Pending", "AGREED", "Agreed", "DECLINED",
            "Declined");
    static final String KIND = "Room Class change";

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final NextTermContext context;
    private final Stays stays;
    private final Moves moves;
    private final Inventory inventory;
    private final RoomClassChanges classes;
    private final Catalog catalog;
    private final FeePolicy fees;
    private final Billing billing;
    private final UserDirectory users;
    private final JsonMapper json;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public RoomClassChangeService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope,
            NextTermContext context, Stays stays, Moves moves, Inventory inventory, RoomClassChanges classes,
            Catalog catalog, FeePolicy fees, Billing billing, UserDirectory users, JsonMapper json,
            ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.context = context;
        this.stays = stays;
        this.moves = moves;
        this.inventory = inventory;
        this.classes = classes;
        this.catalog = catalog;
        this.fees = fees;
        this.billing = billing;
        this.users = users;
        this.json = json;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- student

    @Transactional(readOnly = true)
    public Options options() {
        long me = currentUser.require(Role.STUDENT).userId();
        Optional<NextTermContext.Filing> filing = context.of(me);
        if (filing.isEmpty()) {
            return new Options(null, null, null, null, null, List.of(), 0, null, false,
                    "Room Class changes are asked for the next Term, while its requests window is open and your Bed is"
                            + " kept for it.");
        }
        NextTermContext.Filing f = filing.get();
        Moves.Placement p = f.placement();
        Map<Long, String> names = classNames();
        long termId = f.window().termId();
        List<ClassOption> options = catalog.roomClasses().stream().filter(Catalog.RoomClassInfo::active)
                .filter(c -> c.id() != p.roomClassId())
                .map(c -> new ClassOption(String.valueOf(c.id()), c.name(), price(termId, p.roomTypeId(), c.id())))
                .toList();
        int residents = (int) stays.ofRoom(p.roomId(), termId).stream().filter(Stays.NextTerm::continuing).count();
        Optional<Change> open = openOf(p.roomId(), termId);
        String unavailable = !f.window().filing(Instant.now(clock))
                ? "Next-Term requests closed on " + NextTermContext.when(f.window().closesAt()) + "."
                : !f.nextTerm().continuing() ? "This is the last Term of your stay: ask for an extension first."
                : open.isPresent() ? "Your Room already has a Room Class change waiting." : null;
        return new Options(String.valueOf(termId), f.window().termName(), p.room(), typeName(p.roomTypeId()),
                new ClassOption(String.valueOf(p.roomClassId()), names.get(p.roomClassId()),
                        price(termId, p.roomTypeId(), p.roomClassId())),
                options, residents, open.map(this::openChange).orElse(null), unavailable == null, unavailable);
    }

    /** A continuing resident asks for another class of their next-Term Room. */
    @Transactional
    public Created create(Long roomClassId, String reason) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        NextTermContext.Filing f = context.filing(me.userId());
        if (!f.nextTerm().continuing()) {
            throw ApiException.conflict("EXTEND_FIRST", "This is the last Term of your stay: ask for an extension first.");
        }
        Moves.Placement p = f.placement();
        return insert(f.window(), p.roomId(), p.room(), p.buildingId(), p.roomTypeId(), p.roomClassId(), roomClassId,
                reason, me, "STUDENT");
    }

    /**
     * A Manager changes a Room's class for the next Term (supply reasons, spec §6.11 step 7): with continuing
     * residents in the Room it needs their consent like a student's request; without, it waits for the decision.
     */
    @Transactional
    public Created createForRoom(Long termId, String room, Long roomClassId, String reason) {
        AuthenticatedUser me = currentUser.require(Role.MANAGER);
        if (termId == null) {
            throw FieldErrors.single("termId", "Choose the next Term.");
        }
        Stays.Window w = context.window(termId).orElseThrow(() -> ApiException.notFound(
                "This Term has no requests window: it has no renewal milestones."));
        context.checkDeciding(w.termId());
        String code = room == null ? "" : room.trim();
        Inventory.BedSlot bed = inventory.assignableBeds(w.termId()).stream()
                .filter(b -> b.roomCode().equalsIgnoreCase(code)).findFirst()
                .orElseThrow(() -> FieldErrors.single("room", "Choose a Room the Term uses."));
        if (reason == null || reason.isBlank()) {
            throw FieldErrors.single("reason", "Write why the Room changes class.");
        }
        return insert(w, bed.roomId(), bed.roomCode(), bed.buildingId(), bed.roomTypeId(), bed.roomClassId(),
                roomClassId, reason, me, "MANAGER");
    }

    private Created insert(Stays.Window w, long roomId, String room, long buildingId, long roomTypeId, long fromClassId,
            Long toClassId, String reason, AuthenticatedUser by, String role) {
        FieldErrors errors = new FieldErrors();
        errors.check(toClassId != null && toClassId != fromClassId, "roomClassId",
                "Choose a Room Class other than the Room's.");
        String why = reason == null || reason.isBlank() ? null : reason.trim();
        errors.check(why == null || why.length() <= 500, "reason", "Keep the reason under 500 characters.");
        errors.throwIfAny();
        if (catalog.roomClasses().stream().noneMatch(c -> c.id() == toClassId && c.active())
                || price(w.termId(), roomTypeId, toClassId) == null) {
            throw FieldErrors.single("roomClassId", "This Room Class is not offered in " + w.termName() + ".");
        }
        List<Stays.NextTerm> others = stays.ofRoom(roomId, w.termId()).stream().filter(Stays.NextTerm::continuing)
                .filter(n -> n.studentId() != by.userId()).toList();
        String status = others.isEmpty() ? "SUBMITTED" : "AWAITING_CONSENT";
        Instant now = Instant.now(clock);
        long id;
        try {
            id = jdbc.sql("""
                    WITH next AS (SELECT nextval(pg_get_serial_sequence('req_room_class_change', 'id')) AS id)
                    INSERT INTO req_room_class_change (id, code, term_id, room_id, building_id, room_code, from_class_id,
                                                       to_class_id, requested_by, requester_role, reason, status,
                                                       sla_due_at, submitted_at)
                    OVERRIDING SYSTEM VALUE
                    SELECT id, 'CC-' || :termCode || '-' || lpad(id::text, greatest(6, length(id::text)), '0'), :term,
                           :room, :building, :roomCode, :from, :to, :by, :role, :reason, :status, :due, :now
                    FROM next
                    RETURNING id
                    """).param("termCode", w.termCode()).param("term", w.termId()).param("room", roomId)
                    .param("building", buildingId).param("roomCode", room).param("from", fromClassId)
                    .param("to", toClassId).param("by", by.userId()).param("role", role).param("reason", why)
                    .param("status", status).param("due", Timestamp.from(w.decisionsDueAt()))
                    .param("now", Timestamp.from(now)).query(Long.class).single();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("OPEN_REQUEST", "Room " + room + " already has a Room Class change waiting.");
        }
        if (role.equals("STUDENT")) {
            stays.nextTerm(by.userId(), w.termId()).ifPresent(n -> consent(id, n, "AGREED", now));
        }
        others.forEach(n -> consent(id, n, "PENDING", now));
        Change c = find(String.valueOf(id), false).orElseThrow();
        Map<Long, String> names = classNames();
        if (!others.isEmpty()) {
            events.publishEvent(new RoomClassConsentAsked(id, c.code(), others.stream().map(Stays.NextTerm::studentId)
                    .toList(), by.name(), room, names.get(fromClassId), names.get(toClassId), w.termName()));
        }
        audit.record("ROOM_CLASS_CHANGE_REQUESTED", AuditLog.Tone.INFO, "Room", roomId, room,
                Map.of("request", c.code(), "to", names.get(toClassId), "consentsAsked", others.size()));
        return new Created(c.code(), STATUSES.get(status));
    }

    /** A continuing resident of the Room answers; a refusal cancels the request, the last agreement sends it to Staff. */
    @Transactional
    public void answer(String id, Boolean agree) {
        if (agree == null) {
            throw FieldErrors.single("agree", "Agree or decline the change.");
        }
        long me = currentUser.require(Role.STUDENT).userId();
        Change c = find(id, true).orElseThrow(RoomClassChangeService::notFound);
        Optional<ConsentRow> mine = consents(c.id()).stream().filter(r -> r.studentId() == me).findFirst();
        if (mine.isEmpty()) {
            throw notFound();
        }
        if (!c.status().equals("AWAITING_CONSENT") || !mine.get().status().equals("PENDING")) {
            throw ApiException.conflict("CONSENT_CLOSED", "This change is no longer waiting for your answer.");
        }
        Instant now = Instant.now(clock);
        jdbc.sql("""
                UPDATE req_room_class_consent SET status = :status, answered_at = :now
                WHERE change_id = :id AND student_id = :me
                """).param("status", agree ? "AGREED" : "DECLINED").param("now", Timestamp.from(now))
                .param("id", c.id()).param("me", me).update();
        if (!agree) {
            close(c, "CANCELLED", "A resident of Room " + c.roomCode() + " did not agree.", now);
            return;
        }
        advance(c, now);
    }

    /** The student's consents and the changes of their Room, for the requests screen. */
    @Transactional(readOnly = true)
    public List<RoomChangeService.StudentItem> ofStudent(long studentId, Long termId) {
        List<Change> rows = jdbc.sql("""
                SELECT c.* FROM req_room_class_change c
                WHERE (c.requested_by = :s OR EXISTS (SELECT 1 FROM req_room_class_consent x
                                                       WHERE x.change_id = c.id AND x.student_id = :s))
                """ + (termId != null ? " AND c.term_id = :t" : "") + " ORDER BY c.submitted_at DESC, c.id DESC")
                .params(termId != null ? Map.of("s", studentId, "t", termId) : Map.of("s", studentId))
                .query(RoomClassChangeService::change).list();
        Map<Long, String> names = classNames();
        return rows.stream().map(c -> {
            boolean asked = c.status().equals("AWAITING_CONSENT") && consents(c.id()).stream()
                    .anyMatch(r -> r.studentId() == studentId && r.status().equals("PENDING"));
            return new RoomChangeService.StudentItem(c.code(), KIND, "Room " + c.roomCode() + " · "
                    + names.get(c.fromClassId()) + " → " + names.get(c.toClassId()), c.submittedAt(),
                    STATUSES.get(c.status()),
                    c.decidedAt() == null && c.decisionNote() == null ? null
                            : new RoomChangeService.StudentDecision(c.decisionNote(), c.decidedAt()),
                    null, null, asked ? c.code() : null);
        }).toList();
    }

    // ---------------------------------------------------------------- Staff and Managers

    /** @param status a status label; {@code termId} null = the latest open requests window */
    @Transactional(readOnly = true)
    public ItemPage list(Long termId, String block, String status, PageQuery page) {
        currentUser.require(Permission.DECIDE_ROOM_CHANGES);
        Set<Long> scope = blockScope.resolve(block).ids();
        long term = termOf(termId);
        Map<String, Object> params = new HashMap<>();
        params.put("term", term);
        params.put("scope", List.copyOf(scope));
        StringBuilder where = new StringBuilder(" WHERE term_id = :term AND building_id IN (:scope)");
        if (status != null && !status.isBlank()) {
            String code = STATUSES.entrySet().stream().filter(e -> e.getValue().equalsIgnoreCase(status.trim()))
                    .map(Map.Entry::getKey).findFirst()
                    .orElseThrow(() -> FieldErrors.single("status", "Choose a valid status."));
            where.append(" AND status = :status");
            params.put("status", code);
        }
        long total = jdbc.sql("SELECT count(*) FROM req_room_class_change" + where).params(params).query(Long.class)
                .single();
        params.put("limit", page.limit());
        params.put("offset", page.offset());
        List<Change> rows = jdbc.sql("SELECT * FROM req_room_class_change" + where + """
                 ORDER BY (status IN ('AWAITING_CONSENT', 'SUBMITTED')) DESC, (status = 'SUBMITTED') DESC,
                          submitted_at DESC, id DESC
                 LIMIT :limit OFFSET :offset
                """).params(params).query(RoomClassChangeService::change).list();
        Map<Long, String> requesters = users.displayNames(rows.stream().map(Change::requestedBy)
                .collect(Collectors.toSet()));
        Map<Long, String> blocks = blocks(rows);
        Map<Long, String> names = classNames();
        return new ItemPage(rows.stream().map(c -> item(c, requesters, blocks, names)).toList(), total,
                context.window(term).map(RoomChangeService::window).orElse(null));
    }

    @Transactional(readOnly = true)
    public Detail detail(String id) {
        currentUser.require(Permission.DECIDE_ROOM_CHANGES);
        Change c = inScope(id, false);
        Map<Long, String> names = classNames();
        Map<Long, String> requesters = users.displayNames(List.of(c.requestedBy()));
        Inventory.BedSlot bed = inventory.bedsOfRoom(c.termId(), c.roomId()).stream().findFirst().orElse(null);
        Long fromPrice = bed == null ? null : price(c.termId(), bed.roomTypeId(), c.fromClassId());
        Long toPrice = bed == null ? null : price(c.termId(), bed.roomTypeId(), c.toClassId());
        Furniture furniture = c.status().equals("APPROVED") || c.status().equals("SET_BACK") ? stored(c)
                : furniture(classes.check(c.roomId(), c.termId(), c.toClassId()));
        String decider = c.decidedBy() == null ? null : users.displayNames(List.of(c.decidedBy())).get(c.decidedBy());
        return new Detail(item(c, requesters, blocks(List.of(c)), names),
                context.window(c.termId()).map(Stays.Window::termName).orElse(null), c.reason(), fromPrice, toPrice,
                residents(c), furniture, c.decisionNote(), decider);
    }

    /**
     * Staff of the Block (or a Manager) approve, which sets the Room's class from the next Term on and reserves the
     * furniture, or reject with a note. Every continuing resident of the Room must have agreed, the new ones too.
     */
    @Transactional
    public Detail decide(String id, String decision, String note) {
        AuthenticatedUser user = currentUser.require(Permission.DECIDE_ROOM_CHANGES);
        Change c = inScope(id, true);
        if (!c.open()) {
            throw ApiException.conflict("ALREADY_DECIDED", "This request was already decided.");
        }
        String text = note == null || note.isBlank() ? null : note.trim();
        if (text != null && text.length() > 1000) {
            throw FieldErrors.single("note", "Keep the note under 1,000 characters.");
        }
        Instant now = Instant.now(clock);
        String d = decision == null ? "" : decision.trim();
        if (d.equalsIgnoreCase("rejected")) {
            if (text == null) {
                throw FieldErrors.single("note", "Write why the change is rejected. The residents see it.");
            }
            jdbc.sql("""
                    UPDATE req_room_class_change SET status = 'REJECTED', decided_by = :by, decided_at = :now,
                           decision_note = :note, version = version + 1
                    WHERE id = :id
                    """).param("by", user.userId()).param("now", Timestamp.from(now)).param("note", text)
                    .param("id", c.id()).update();
            audit.record("ROOM_CLASS_CHANGE_REJECTED", AuditLog.Tone.WARNING, "Room", c.roomId(), c.roomCode(),
                    Map.of("request", c.code(), "note", text));
            events.publishEvent(new NextTermRequestDecided(students(c), KIND, "rejected", text));
            return detail(c.code());
        }
        if (!d.equalsIgnoreCase("approved")) {
            throw FieldErrors.single("decision", "Choose Approved or Rejected.");
        }
        context.checkDeciding(c.termId());
        if (missingConsents(c, now) > 0) {
            throw ApiException.conflict("CONSENT_MISSING",
                    "Every continuing resident of Room " + c.roomCode() + " must agree first.");
        }
        if (heldByNewStudents(c)) {
            throw ApiException.conflict("ROOM_CLASS_LOCKED", "Beds of Room " + c.roomCode()
                    + " are already given to new students at the current price.");
        }
        RoomClassChanges.Check check = classes.apply(c.roomId(), c.termId(), c.toClassId(), user.userId(), c.code());
        Map<Long, String> names = classNames();
        String decided = text != null ? text : "Room " + c.roomCode() + " is " + names.get(c.toClassId()) + " from "
                + context.window(c.termId()).map(Stays.Window::termName).orElse("the next Term")
                + ". Your next-Term room fee uses it.";
        jdbc.sql("""
                UPDATE req_room_class_change SET status = 'APPROVED', decided_by = :by, decided_at = :now,
                       decision_note = :note, furniture = CAST(:furniture AS jsonb), version = version + 1
                WHERE id = :id
                """).param("by", user.userId()).param("now", Timestamp.from(now)).param("note", decided)
                .param("furniture", json.writeValueAsString(furniture(check))).param("id", c.id()).update();
        audit.record("ROOM_CLASS_CHANGE_APPROVED", AuditLog.Tone.SUCCESS, "Room", c.roomId(), c.roomCode(),
                Map.of("request", c.code(), "to", names.get(c.toClassId()), "reserved", check.reserved(),
                        "removing", check.removing()));
        events.publishEvent(new NextTermRequestDecided(students(c), KIND, "approved", decided));
        return detail(c.code());
    }

    /**
     * The Room's furniture did not follow the change by the start of the Term: a Manager sets the class back (spec
     * §6.11 step 6). Unpaid next-Term fees of the Room are void and issued again at the right price; a paid one gets
     * the difference charged (dearer) or refunded (cheaper) — the only price difference left (spec §8).
     */
    @Transactional
    public Detail setBack(String id, String note) {
        AuthenticatedUser user = currentUser.require(Role.MANAGER);
        Change c = inScope(id, true);
        if (!c.status().equals("APPROVED")) {
            throw ApiException.conflict("NOT_APPROVED", "Only an approved change can be set back.");
        }
        if (note == null || note.isBlank() || note.length() > 1000) {
            throw FieldErrors.single("note", "Write why the class is set back (up to 1,000 characters).");
        }
        Instant now = Instant.now(clock);
        classes.setBack(c.roomId(), c.termId(), c.fromClassId(), user.userId(), c.code());
        Stays.Window w = context.window(c.termId()).orElseThrow();
        List<String> money = new ArrayList<>();
        for (Stays.NextTerm n : stays.ofRoom(c.roomId(), c.termId())) {
            Moves.Placement p = moves.placement(n.allocationId()).orElse(null);
            Billing.InvoiceLine fee = billing.termFees(List.of(n.allocationId())).get(n.allocationId());
            if (p == null || fee == null) {
                continue;
            }
            Long right = price(c.termId(), p.roomTypeId(), c.fromClassId());
            if (right == null || right == fee.amount()) {
                continue;
            }
            if (!fee.status().equals("Paid")) {
                if (billing.voidUnpaid(fee.id(), "Room Class set back: issued again at its price")) {
                    billing.issueTermFee(new Billing.TermFeeRequest(c.termId(), n.studentId(), n.allocationId(),
                            c.buildingId(), c.roomCode(), right, w.feesDueAt().isAfter(now) ? w.feesDueAt()
                                    : now.plus(Duration.ofDays(fees.balanceDays()))));
                    money.add(fee.code() + " issued again");
                }
                continue;
            }
            long difference = right - fee.amount();
            if (difference > 0) {
                billing.issueCharge(new Billing.ChargeRequest(c.termId(), n.studentId(), n.allocationId(),
                        c.buildingId(), "ROOM_CHANGE", "Room Class set back", difference,
                        List.of(new Billing.ChargeLine("Room " + c.roomCode() + " is "
                                + classNames().get(c.fromClassId()) + " again", difference)),
                        now.plus(Duration.ofDays(fees.balanceDays())), c.code()));
                money.add(fee.code() + " +" + difference);
            } else {
                billing.requestCredit(c.termId(), n.studentId(), c.buildingId(), "ROOM_CLASS", c.id(),
                        "Room " + c.roomCode() + " set back to " + classNames().get(c.fromClassId()) + " · " + c.code(),
                        -difference);
                money.add(fee.code() + " " + difference);
            }
        }
        jdbc.sql("""
                UPDATE req_room_class_change SET status = 'SET_BACK', decided_by = :by, decided_at = :now,
                       decision_note = :note, version = version + 1
                WHERE id = :id
                """).param("by", user.userId()).param("now", Timestamp.from(now)).param("note", note.trim())
                .param("id", c.id()).update();
        audit.record("ROOM_CLASS_SET_BACK", AuditLog.Tone.WARNING, "Room", c.roomId(), c.roomCode(),
                Map.of("request", c.code(), "note", note.trim(), "fees", money));
        events.publishEvent(new NextTermRequestDecided(students(c), KIND, "set back", note.trim()));
        return detail(c.code());
    }

    // ---------------------------------------------------------------- the window

    /** Open changes of the Term (the requests window and its blockers). */
    long openCount(long termId) {
        return jdbc.sql("""
                SELECT count(*) FROM req_room_class_change WHERE term_id = :t AND status IN ('AWAITING_CONSENT', 'SUBMITTED')
                """).param("t", termId).query(Long.class).single();
    }

    /** Open changes of the Term in the Blocks, oldest first (the Managers' bulk list). */
    List<Item> open(long termId, Set<Long> scope) {
        List<Change> rows = jdbc.sql("""
                SELECT * FROM req_room_class_change
                WHERE term_id = :t AND status IN ('AWAITING_CONSENT', 'SUBMITTED') AND building_id IN (:scope)
                ORDER BY submitted_at, id
                """).param("t", termId).param("scope", List.copyOf(scope)).query(RoomClassChangeService::change).list();
        Map<Long, String> requesters = users.displayNames(rows.stream().map(Change::requestedBy)
                .collect(Collectors.toSet()));
        return rows.stream().map(c -> item(c, requesters, blocks(rows), classNames())).toList();
    }

    /**
     * A next-Term Allocation was cancelled (Assignment's transaction): its student no longer has to agree; a change
     * they asked for themselves is cancelled.
     */
    void allocationCancelled(long allocationId, long studentId, Instant now) {
        List<Change> rows = jdbc.sql("""
                SELECT c.* FROM req_room_class_change c JOIN req_room_class_consent x ON x.change_id = c.id
                WHERE x.allocation_id = :a AND c.status IN ('AWAITING_CONSENT', 'SUBMITTED') FOR UPDATE OF c
                """).param("a", allocationId).query(RoomClassChangeService::change).list();
        for (Change c : rows) {
            if (c.requestedBy() == studentId) {
                close(c, "CANCELLED", "The resident who asked for it does not continue next Term.", now);
                continue;
            }
            jdbc.sql("DELETE FROM req_room_class_consent WHERE change_id = :id AND allocation_id = :a")
                    .param("id", c.id()).param("a", allocationId).update();
            advance(c, now);
        }
    }

    // ---------------------------------------------------------------- helpers

    /** Asks the continuing residents who arrived since the request; every consent given → waiting for Staff. */
    private void advance(Change c, Instant now) {
        if (missingConsents(c, now) == 0 && c.status().equals("AWAITING_CONSENT")) {
            jdbc.sql("UPDATE req_room_class_change SET status = 'SUBMITTED', version = version + 1 WHERE id = :id")
                    .param("id", c.id()).update();
        }
    }

    /**
     * Continuing residents of the Room now who have not agreed; those not asked yet are asked now (spec §6.11 step
     * 5). @return how many have not agreed
     */
    private long missingConsents(Change c, Instant now) {
        List<ConsentRow> given = consents(c.id());
        Map<Long, ConsentRow> byStudent = given.stream().collect(Collectors.toMap(ConsentRow::studentId, r -> r,
                (a, b) -> a));
        List<Stays.NextTerm> residents = stays.ofRoom(c.roomId(), c.termId()).stream()
                .filter(Stays.NextTerm::continuing).toList();
        List<Long> asked = new ArrayList<>();
        long missing = 0;
        for (Stays.NextTerm n : residents) {
            ConsentRow row = byStudent.get(n.studentId());
            if (row == null) {
                consent(c.id(), n, "PENDING", now);
                asked.add(n.studentId());
                missing++;
            } else if (!row.status().equals("AGREED")) {
                missing++;
            }
        }
        if (!asked.isEmpty()) {
            jdbc.sql("UPDATE req_room_class_change SET status = 'AWAITING_CONSENT', version = version + 1 WHERE id = :id")
                    .param("id", c.id()).update();
            Map<Long, String> names = classNames();
            events.publishEvent(new RoomClassConsentAsked(c.id(), c.code(), asked,
                    users.displayNames(List.of(c.requestedBy())).get(c.requestedBy()), c.roomCode(),
                    names.get(c.fromClassId()), names.get(c.toClassId()),
                    context.window(c.termId()).map(Stays.Window::termName).orElse("")));
        }
        return missing;
    }

    /** A Bed of the Room given for the Term to someone other than a continuing resident keeps the old price. */
    private boolean heldByNewStudents(Change c) {
        Set<Long> beds = inventory.bedsOfRoom(c.termId(), c.roomId()).stream().map(Inventory.BedSlot::bedId)
                .collect(Collectors.toSet());
        Set<Long> continuing = stays.ofRoom(c.roomId(), c.termId()).stream().map(Stays.NextTerm::allocationId)
                .collect(Collectors.toSet());
        return stays.allocationsOnBeds(c.termId(), beds).stream().anyMatch(a -> !continuing.contains(a));
    }

    private void close(Change c, String status, String why, Instant now) {
        jdbc.sql("""
                UPDATE req_room_class_change SET status = :status, decision_note = :why, version = version + 1
                WHERE id = :id
                """).param("status", status).param("why", why).param("id", c.id()).update();
        events.publishEvent(new NextTermRequestDecided(students(c), KIND, "cancelled", why));
    }

    private void consent(long changeId, Stays.NextTerm n, String status, Instant now) {
        jdbc.sql("""
                INSERT INTO req_room_class_consent (change_id, student_id, allocation_id, status, asked_at, answered_at)
                VALUES (:id, :student, :allocation, :status, :now, :answered)
                ON CONFLICT (change_id, student_id) DO NOTHING
                """).param("id", changeId).param("student", n.studentId()).param("allocation", n.allocationId())
                .param("status", status).param("now", Timestamp.from(now))
                .param("answered", status.equals("PENDING") ? null : Timestamp.from(now)).update();
    }

    private List<ConsentRow> consents(long changeId) {
        return jdbc.sql("SELECT student_id, allocation_id, status FROM req_room_class_consent WHERE change_id = :id")
                .param("id", changeId)
                .query((rs, i) -> new ConsentRow(rs.getLong("student_id"), rs.getLong("allocation_id"),
                        rs.getString("status")))
                .list();
    }

    /** Everyone the change concerns: the residents asked (and the student who asked). */
    private List<Long> students(Change c) {
        List<Long> ids = new ArrayList<>(consents(c.id()).stream().map(ConsentRow::studentId).toList());
        if (c.requesterRole().equals("STUDENT") && !ids.contains(c.requestedBy())) {
            ids.add(c.requestedBy());
        }
        return ids;
    }

    private List<Consent> residents(Change c) {
        Map<Long, ConsentRow> given = consents(c.id()).stream().collect(Collectors.toMap(ConsentRow::studentId, r -> r,
                (a, b) -> a));
        List<Long> now = stays.ofRoom(c.roomId(), c.termId()).stream().filter(Stays.NextTerm::continuing)
                .map(Stays.NextTerm::studentId).toList();
        LinkedHashMap<Long, String> shown = new LinkedHashMap<>();
        now.forEach(s -> shown.put(s, given.containsKey(s) ? CONSENTS.get(given.get(s).status()) : "Not asked yet"));
        given.forEach((s, r) -> shown.putIfAbsent(s, CONSENTS.get(r.status())));
        Map<Long, String> names = users.displayNames(shown.keySet());
        return shown.entrySet().stream().map(e -> new Consent(names.get(e.getKey()), e.getValue())).toList();
    }

    private OpenChange openChange(Change c) {
        Map<Long, String> names = classNames();
        Map<Long, String> people = users.displayNames(consents(c.id()).stream().map(ConsentRow::studentId).toList());
        return new OpenChange(c.code(), STATUSES.get(c.status()), names.get(c.toClassId()),
                users.displayNames(List.of(c.requestedBy())).get(c.requestedBy()),
                consents(c.id()).stream().map(r -> new Consent(people.get(r.studentId()), CONSENTS.get(r.status())))
                        .toList());
    }

    private Item item(Change c, Map<Long, String> requesters, Map<Long, String> blocks, Map<Long, String> names) {
        List<ConsentRow> given = consents(c.id());
        return new Item(c.code(), c.roomCode(), blocks.get(c.buildingId()), names.get(c.fromClassId()),
                names.get(c.toClassId()), requesters.get(c.requestedBy()),
                c.requesterRole().equals("MANAGER") ? "Manager" : "Student",
                (int) given.stream().filter(r -> r.status().equals("AGREED")).count(), given.size(),
                STATUSES.get(c.status()), c.submittedAt(), c.dueAt(), c.decidedAt());
    }

    private Map<Long, String> blocks(List<Change> rows) {
        Map<Long, String> result = new HashMap<>();
        for (Change c : rows) {
            result.computeIfAbsent(c.buildingId(), b -> inventory.bedsOfRoom(c.roomId()).stream().findFirst()
                    .map(Inventory.BedSlot::block).orElse(null));
        }
        return result;
    }

    private Furniture furniture(RoomClassChanges.Check check) {
        return new Furniture(check.enough(),
                check.missing().stream().map(n -> new Need(n.type(), n.typeVi(), n.quantity(), n.available())).toList(),
                check.extra().stream().map(n -> new Need(n.type(), n.typeVi(), n.quantity(), n.available())).toList(),
                check.reserved(), check.removing());
    }

    private Furniture stored(Change c) {
        if (c.furniture() == null) {
            return null;
        }
        return json.readValue(c.furniture(), Furniture.class);
    }

    private Optional<Change> openOf(long roomId, long termId) {
        return jdbc.sql("""
                SELECT * FROM req_room_class_change
                WHERE room_id = :room AND term_id = :t AND status IN ('AWAITING_CONSENT', 'SUBMITTED')
                """).param("room", roomId).param("t", termId).query(RoomClassChangeService::change).optional();
    }

    private long termOf(Long termId) {
        if (termId != null) {
            return context.window(termId).map(Stays.Window::termId).orElseThrow(() -> ApiException.notFound(
                    "This Term has no requests window: it has no renewal milestones."));
        }
        return context.current().map(Stays.Window::termId)
                .orElseThrow(() -> ApiException.notFound("No requests window is open."));
    }

    private Change inScope(String id, boolean lock) {
        Change c = find(id, lock).orElseThrow(RoomClassChangeService::notFound);
        if (!blockScope.resolve(null).ids().contains(c.buildingId())) {
            throw ApiException.forbidden("BLOCK_OUT_OF_SCOPE", "You do not have access to this Block.");
        }
        return c;
    }

    private Optional<Change> find(String id, boolean lock) {
        if (id == null || id.isBlank() || id.length() > 24) {
            return Optional.empty();
        }
        String value = id.trim();
        boolean numeric = value.chars().allMatch(Character::isDigit);
        return jdbc.sql("SELECT * FROM req_room_class_change WHERE " + (numeric ? "id = :v" : "upper(code) = upper(:v)")
                + (lock ? " FOR UPDATE" : ""))
                .param("v", numeric ? (Object) Long.parseLong(value) : value).query(RoomClassChangeService::change)
                .optional();
    }

    private Long price(long termId, long roomTypeId, long roomClassId) {
        OptionalLong p = fees.termPrice(termId, roomTypeId, roomClassId);
        return p.isPresent() ? p.getAsLong() : null;
    }

    private String typeName(long id) {
        return catalog.roomTypes().stream().filter(t -> t.id() == id).map(Catalog.RoomTypeInfo::name).findFirst()
                .orElse(null);
    }

    private Map<Long, String> classNames() {
        return catalog.roomClasses().stream().collect(Collectors.toMap(Catalog.RoomClassInfo::id,
                Catalog.RoomClassInfo::name));
    }

    private static ApiException notFound() {
        return ApiException.notFound("This Room Class change does not exist.");
    }

    private static Change change(ResultSet rs, int i) throws SQLException {
        Timestamp due = rs.getTimestamp("sla_due_at");
        Timestamp decided = rs.getTimestamp("decided_at");
        return new Change(rs.getLong("id"), rs.getString("code"), rs.getLong("term_id"), rs.getLong("room_id"),
                rs.getLong("building_id"), rs.getString("room_code"), rs.getLong("from_class_id"),
                rs.getLong("to_class_id"), rs.getLong("requested_by"), rs.getString("requester_role"),
                rs.getString("reason"), rs.getString("status"), due == null ? null : due.toInstant(),
                rs.getString("furniture"), rs.getObject("decided_by", Long.class),
                decided == null ? null : decided.toInstant(), rs.getString("decision_note"),
                rs.getTimestamp("submitted_at").toInstant());
    }
}
