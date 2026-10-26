package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.event.NextTermRequestDecided;
import vn.fpt.campusstay.event.ResidentMoved;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.setting.Lookups;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * Operational moves (spec §6.13, D-14, D-31): Staff (inside their Blocks) or a Manager move a student to another Bed
 * of the same Term for a recorded reason (Room unusable, safety, serious conflict, other). Nothing is charged or
 * refunded. A move of a resident cuts their stay in the old Room (its door code rotates) and releases the new Room's
 * code; the next-Term Allocation follows to the new Bed unless the decider keeps it. A next-Term Allocation can be
 * moved too; once the next-Term fees are issued only a Manager does it: an unpaid fee is voided and issued again for
 * the new Bed, a paid one allows only a Bed of the same price.
 */
@Service
public class OperationalMoveService {

    public record Person(String name, String studentCode) {
    }

    public record Place(String room, String bed, String block, String roomTypeName, String roomClassName) {
    }

    public record TermRef(String id, String name) {
    }

    /**
     * @param allocationId the next-Term Allocation (to move the next-Term Bed on its own)
     * @param state        {@code Continuing} or {@code Awaiting extension}; {@code fee} the next-Term fee's status or null
     */
    public record NextTermRef(String allocationId, TermRef term, Place place, String state, String fee) {
    }

    public record BedOption(String bedId, String room, String bed, String block, int floor, String roomTypeName,
            String roomClassName, int roommates, Long termPrice) {
    }

    /**
     * @param nextTermAllocation the Allocation is itself a next-Term one (moved for the next Term)
     * @param feesIssued         its Term's next-Term fees are issued (only a Manager moves it then)
     * @param resident           the student lives in the Room: a move needs the meter readings of both Rooms
     */
    public record Options(String allocationId, Person student, TermRef term, Place from, boolean resident,
            boolean nextTermAllocation,
            boolean feesIssued, NextTermRef nextTerm, List<BedOption> beds, List<String> reasons) {
    }

    /**
     * @param nextTerm        {@code follow} (default) or {@code keep}
     * @param fromElectricity meter readings of the old and the new Room, needed when a resident moves (both Rooms'
     *                        meters are cut so Utility is split by who lived where)
     */
    public record MoveCommand(String allocationId, String bedId, String reason, String note, String nextTerm,
            BigDecimal fromElectricity, BigDecimal fromWater, BigDecimal toElectricity, BigDecimal toWater) {
    }

    /** @param nextTerm {@code Followed}, {@code Kept} or {@code None} */
    public record Moved(String allocationId, String room, String bed, String nextTerm, String note) {
    }

    public record MoveItem(String id, Person student, String term, String from, String to, String reason, String note,
            String nextTerm, String movedBy, Instant movedAt) {
    }

    public record MovePage(List<MoveItem> items, long total, List<String> reasons) {
    }

    private record Move(long id, long termId, long studentId, long fromBedId, long toBedId, String reason, String note,
            String nextTerm, long movedBy, Instant movedAt) {
    }

    private static final Map<String, String> NEXT_TERM = Map.of("FOLLOWED", "Followed", "KEPT", "Kept", "NONE", "None");

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final TermCatalog terms;
    private final Moves moves;
    private final JdbcStays stays;
    private final Inventory inventory;
    private final Catalog catalog;
    private final FeePolicy fees;
    private final Lookups lookups;
    private final Billing billing;
    private final UserDirectory users;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public OperationalMoveService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, TermCatalog terms,
            Moves moves, JdbcStays stays, Inventory inventory, Catalog catalog,
            FeePolicy fees, Lookups lookups, Billing billing, UserDirectory users, ApplicationEventPublisher events,
            AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.terms = terms;
        this.moves = moves;
        this.stays = stays;
        this.inventory = inventory;
        this.catalog = catalog;
        this.fees = fees;
        this.lookups = lookups;
        this.billing = billing;
        this.users = users;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * @param allocationId the Allocation to move; or {@code q}, a student code: the Bed they live in now, else their
     *                     Bed for the next Term
     */
    @Transactional(readOnly = true)
    public Options options(String allocationId, String q) {
        AuthenticatedUser user = currentUser.require(Permission.MOVE_RESIDENTS);
        Moves.Placement p = allocationId != null && !allocationId.isBlank() ? placement(allocationId) : byCode(q);
        Optional<Stays.NextTerm> own = stays.nextTerms(List.of(p.allocationId())).values().stream().findFirst();
        Optional<Stays.Window> ownWindow = own.flatMap(n -> stays.window(n.termId()));
        TermSummary term = terms.findPublished(p.termId()).orElseThrow();
        Names names = names();
        NextTermRef next = own.isPresent() ? null : nextTermOf(p, names).orElse(null);
        List<BedOption> beds = moves.freeBeds(p.termId(), p.gender()).stream()
                .filter(b -> b.roomId() != p.roomId() && mayMoveInto(user, b.buildingId()))
                .limit(200)
                .map(b -> {
                    var slot = inventory.beds(p.termId(), List.of(b.bedId())).get(b.bedId());
                    OptionalLong price = slot == null ? OptionalLong.empty()
                            : fees.termPrice(p.termId(), slot.roomTypeId(), slot.roomClassId());
                    return new BedOption(b.code(), b.room(), b.bed(), b.block(), b.floor(),
                            slot == null ? null : names.type(slot.roomTypeId()),
                            slot == null ? null : names.roomClass(slot.roomClassId()), b.roommates(),
                            price.isPresent() ? price.getAsLong() : null);
                })
                .toList();
        return new Options(String.valueOf(p.allocationId()), person(p.studentId()),
                new TermRef(String.valueOf(term.id()), term.name()), place(p, names), p.residentAt() != null, own.isPresent(),
                ownWindow.map(w -> w.feesIssuedAt() != null).orElse(false), next, beds, reasons());
    }

    @Transactional
    public Moved move(MoveCommand cmd) {
        AuthenticatedUser user = currentUser.require(Permission.MOVE_RESIDENTS);
        FieldErrors errors = new FieldErrors();
        errors.check(cmd.bedId() != null && !cmd.bedId().isBlank(), "bedId", "Choose a Bed.");
        String reason = cmd.reason() == null ? null : lookups.find("MOVE_REASON", cmd.reason().trim())
                .map(Lookups.Lookup::code).orElse(null);
        errors.check(reason != null, "reason", "Choose why the student moves.");
        String note = cmd.note() == null || cmd.note().isBlank() ? null : cmd.note().trim();
        errors.check(note == null || note.length() <= 500, "note", "Keep the note under 500 characters.");
        errors.check(!"OTHER".equals(reason) || note != null, "note", "Write why the student moves.");
        String follow = cmd.nextTerm() == null || cmd.nextTerm().isBlank() ? "follow"
                : cmd.nextTerm().trim().toLowerCase(Locale.ROOT);
        errors.check(follow.equals("follow") || follow.equals("keep"), "nextTerm", "Choose follow or keep.");
        errors.throwIfAny();
        Moves.Placement p = placement(cmd.allocationId());
        Moves.FreeBed bed = freeBed(p, cmd.bedId(), user);
        Optional<Stays.NextTerm> own = stays.nextTerms(List.of(p.allocationId())).values().stream().findFirst();
        Names names = names();
        String label = label(reason);
        Instant now = Instant.now(clock);
        long moved;
        String nextTerm = "NONE";
        boolean reissued = false;
        StringBuilder text = new StringBuilder();
        if (own.isPresent()) {
            // A next-Term Allocation: the student moves to this Bed in the next Term.
            reissued = moveNextTerm(own.get(), p, bed, user, true);
            moved = moves.move(p.allocationId(), bed.bedId(), "MOVE", user.userId());
            if (reissued) {
                reissueFee(p, moved, bed);
            }
            TermSummary term = terms.findPublished(p.termId()).orElseThrow();
            text.append("In ").append(term.name()).append(" the student moves to Room ").append(bed.room())
                    .append(" · Bed ").append(bed.bed()).append('.');
            events.publishEvent(new NextTermRequestDecided(List.of(p.studentId()), "Next-Term Bed", "changed",
                    "Your Bed for " + term.name() + " is now Room " + bed.room() + " · Bed " + bed.bed() + "."));
        } else {
            if (p.residentAt() != null) {
                // The resident leaves one Room for another: both meters are cut (spec §6.13).
                billing.recordMeterCut(p.roomId(), p.room(), cmd.fromElectricity(), cmd.fromWater(), "MOVE",
                        p.allocationId(), user.userId(), "from");
                billing.recordMeterCut(bed.roomId(), bed.room(), cmd.toElectricity(), cmd.toWater(), "MOVE",
                        p.allocationId(), user.userId(), "to");
            }
            moved = moves.move(p.allocationId(), bed.bedId(), "MOVE", user.userId());
            text.append("Moved to Room ").append(bed.room()).append(" · Bed ").append(bed.bed()).append('.');
            Optional<Moves.Placement> next = nextTermPlacement(p);
            if (next.isPresent()) {
                if (follow.equals("keep")) {
                    nextTerm = "KEPT";
                    text.append(" The Bed for the next Term stays ").append(next.get().bedCode()).append('.');
                } else {
                    nextTerm = followNextTerm(next.get(), bed, user, text) ? "FOLLOWED" : "KEPT";
                }
            }
            events.publishEvent(new ResidentMoved(p.studentId(), bed.room(), bed.bed(), label));
        }
        jdbc.sql("""
                INSERT INTO asg_move (term_id, student_id, from_allocation_id, to_allocation_id, from_bed_id, to_bed_id,
                                      reason, note, next_term, reissued_fee, moved_by, moved_at)
                VALUES (:term, :student, :from, :to, :fromBed, :toBed, :reason, :note, :next, :reissued, :by, :now)
                """).param("term", p.termId()).param("student", p.studentId()).param("from", p.allocationId())
                .param("to", moved).param("fromBed", p.bedId()).param("toBed", bed.bedId()).param("reason", reason)
                .param("note", note).param("next", nextTerm).param("reissued", reissued).param("by", user.userId())
                .param("now", Timestamp.from(now)).update();
        Map<String, Object> change = new HashMap<>();
        change.put("from", p.bedCode());
        change.put("to", bed.code());
        change.put("reason", label);
        change.put("nextTerm", NEXT_TERM.get(nextTerm));
        if (note != null) {
            change.put("note", note);
        }
        audit.record("RESIDENT_MOVED", AuditLog.Tone.INFO, "Allocation", p.allocationId(),
                "Room " + p.room() + " · Bed " + p.bed(), change);
        return new Moved(String.valueOf(moved), bed.room(), bed.bed(), NEXT_TERM.get(nextTerm), text.toString());
    }

    @Transactional(readOnly = true)
    public MovePage list(Long termId, String block, PageQuery page) {
        currentUser.require(Permission.MOVE_RESIDENTS);
        Set<Long> scope = blockScope.resolve(block).ids();
        Map<String, Object> params = new HashMap<>();
        String where = termId == null ? "" : " WHERE term_id = :term";
        if (termId != null) {
            params.put("term", termId);
        }
        List<Move> rows = jdbc.sql("SELECT * FROM asg_move" + where + " ORDER BY moved_at DESC, id DESC").params(params)
                .query(OperationalMoveService::move).list();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(rows.stream()
                .flatMap(m -> Stream.of(m.fromBedId(), m.toBedId())).collect(Collectors.toSet()));
        List<Move> visible = rows.stream().filter(m -> {
            var from = beds.get(m.fromBedId());
            var to = beds.get(m.toBedId());
            return from != null && to != null && (scope.contains(from.buildingId()) || scope.contains(to.buildingId()));
        }).toList();
        List<Move> shown = visible.stream().skip(page.offset()).limit(page.limit()).toList();
        Map<Long, UserDirectory.Student> students = users.students(shown.stream().map(Move::studentId).toList());
        Map<Long, String> movers = users.displayNames(shown.stream().map(Move::movedBy).collect(Collectors.toSet()));
        Map<Long, String> termNames = terms.publishedTerms().stream()
                .collect(Collectors.toMap(TermSummary::id, TermSummary::name));
        List<MoveItem> items = shown.stream().map(m -> {
            UserDirectory.Student s = students.get(m.studentId());
            return new MoveItem(String.valueOf(m.id()), new Person(s == null ? null : s.name(),
                    s == null ? null : s.studentCode()), termNames.get(m.termId()), beds.get(m.fromBedId()).code(),
                    beds.get(m.toBedId()).code(), label(m.reason()), m.note(), NEXT_TERM.get(m.nextTerm()),
                    movers.get(m.movedBy()), m.movedAt());
        }).toList();
        return new MovePage(items, visible.size(), reasons());
    }

    // ---------------------------------------------------------------- next-Term rules

    /**
     * Checks a move of a next-Term Allocation. After the next-Term fees were issued only a Manager moves it: a paid
     * fee allows only a Bed of the same price; an unpaid one is voided (and issued again by the caller).
     *
     * @param strict refuse when the move is not allowed (false: report it as not possible)
     * @return whether the fee must be issued again for the new Bed
     */
    private boolean moveNextTerm(Stays.NextTerm n, Moves.Placement p, Moves.FreeBed bed, AuthenticatedUser user,
            boolean strict) {
        Optional<Stays.Window> window = stays.window(n.termId());
        if (window.isEmpty() || window.get().feesIssuedAt() == null) {
            return false;
        }
        if (!user.is(Role.MANAGER)) {
            if (strict) {
                throw ApiException.forbidden("MANAGER_DECIDES",
                        "The next-Term fees are issued: only a Manager moves a student for the next Term now.");
            }
            return false;
        }
        Billing.InvoiceLine fee = billing.termFees(List.of(p.allocationId())).get(p.allocationId());
        if (fee == null) {
            return false;
        }
        var slot = inventory.beds(n.termId(), List.of(bed.bedId())).get(bed.bedId());
        long price = slot == null ? -1 : fees.termPrice(n.termId(), slot.roomTypeId(), slot.roomClassId()).orElse(-1);
        if (fee.status().equals("Paid")) {
            if (price != fee.amount()) {
                throw ApiException.conflict("PRICE_DIFFERS", "The next-Term fee is paid: move this student only to a"
                        + " Bed of the same price.");
            }
            return false;
        }
        if (!billing.voidUnpaid(fee.id(), "Next-Term Bed changed: issued again for the new Bed")) {
            throw ApiException.conflict("CLAIM_WAITING", "The student said they paid the next-Term fee. Confirm or"
                    + " reject the payment first.");
        }
        return true;
    }

    private void reissueFee(Moves.Placement p, long allocationId, Moves.FreeBed bed) {
        Stays.Window w = stays.window(p.termId()).orElseThrow();
        var slot = inventory.beds(p.termId(), List.of(bed.bedId())).get(bed.bedId());
        long price = fees.termPrice(p.termId(), slot.roomTypeId(), slot.roomClassId()).orElseThrow(() ->
                ApiException.conflict("NO_PRICE", "Room " + bed.room() + " has no price in " + w.termName() + "."));
        billing.issueTermFee(new Billing.TermFeeRequest(p.termId(), p.studentId(), allocationId, bed.buildingId(),
                bed.room(), price, w.feesDueAt()));
    }

    /** The student's next-Term Allocation follows to the same Bed when it is free in the next Term. */
    private boolean followNextTerm(Moves.Placement next, Moves.FreeBed bed, AuthenticatedUser user, StringBuilder text) {
        Optional<Moves.FreeBed> free = moves.freeBeds(next.termId(), next.gender()).stream()
                .filter(b -> b.bedId() == bed.bedId()).findFirst();
        Stays.NextTerm n = stays.nextTerms(List.of(next.allocationId())).get(next.allocationId());
        if (free.isEmpty() || n == null) {
            text.append(" This Bed is taken in the next Term, so the next-Term Bed stays ").append(next.bedCode())
                    .append('.');
            return false;
        }
        boolean reissue;
        try {
            reissue = moveNextTerm(n, next, free.get(), user, false);
        } catch (ApiException e) {
            text.append(" The next-Term Bed stays ").append(next.bedCode()).append(": ").append(e.getMessage());
            return false;
        }
        Optional<Stays.Window> window = stays.window(next.termId());
        if (window.isPresent() && window.get().feesIssuedAt() != null && !user.is(Role.MANAGER)) {
            text.append(" The next-Term fees are issued, so the next-Term Bed stays ").append(next.bedCode())
                    .append(" (a Manager can move it).");
            return false;
        }
        long moved = moves.move(next.allocationId(), bed.bedId(), "MOVE", user.userId());
        if (reissue) {
            reissueFee(next, moved, free.get());
        }
        text.append(" The next-Term Bed follows.");
        return true;
    }

    private Optional<Moves.Placement> nextTermPlacement(Moves.Placement p) {
        return jdbc.sql("""
                SELECT id FROM asg_allocation
                WHERE student_id = :s AND status = 'ACTIVE' AND renewal IS NOT NULL AND term_id <> :t
                """).param("s", p.studentId()).param("t", p.termId()).query(Long.class).optional()
                .flatMap(moves::placement);
    }

    private Optional<NextTermRef> nextTermOf(Moves.Placement p, Names names) {
        return nextTermPlacement(p).map(next -> {
            Stays.NextTerm n = stays.nextTerms(List.of(next.allocationId())).get(next.allocationId());
            TermSummary term = terms.findPublished(next.termId()).orElseThrow();
            Billing.InvoiceLine fee = billing.termFees(List.of(next.allocationId())).get(next.allocationId());
            return new NextTermRef(String.valueOf(next.allocationId()),
                    new TermRef(String.valueOf(term.id()), term.name()), place(next, names),
                    n == null ? null : n.continuing() ? "Continuing" : "Awaiting extension",
                    fee == null ? null : fee.status());
        });
    }

    // ---------------------------------------------------------------- helpers

    /** Staff decide moves inside their Blocks; a move to another Block is a Manager's (ADR-19). */
    private static boolean mayMoveInto(AuthenticatedUser user, long buildingId) {
        return !user.is(Role.STAFF) || user.blockIds().contains(buildingId);
    }

    private Moves.Placement placement(String allocationId) {
        long id = parse(allocationId).orElseThrow(() -> ApiException.notFound("This Allocation does not exist."));
        Moves.Placement p = moves.placement(id).filter(Moves.Placement::active)
                .orElseThrow(() -> ApiException.notFound("This Allocation does not exist."));
        blockScope.check(p.buildingId());
        return p;
    }

    private Moves.Placement byCode(String q) {
        if (q == null || q.isBlank()) {
            throw FieldErrors.single("q", "Type the student code.");
        }
        long studentId = users.studentByCode(q.trim()).map(UserDirectory.StudentProfile::userId)
                .orElseThrow(() -> ApiException.notFound("No student has this code."));
        long id = jdbc.sql("""
                SELECT id FROM asg_allocation WHERE student_id = :s AND status = 'ACTIVE'
                ORDER BY (resident_at IS NOT NULL) DESC, (renewal IS NULL) DESC, allocated_at DESC LIMIT 1
                """).param("s", studentId).query(Long.class).optional()
                .orElseThrow(() -> ApiException.notFound("This student holds no Bed."));
        return placement(String.valueOf(id));
    }

    private Moves.FreeBed freeBed(Moves.Placement p, String bedId, AuthenticatedUser user) {
        String value = bedId.trim();
        Moves.FreeBed bed = moves.freeBeds(p.termId(), p.gender()).stream()
                .filter(b -> b.code().equalsIgnoreCase(value) || String.valueOf(b.bedId()).equals(value)).findFirst()
                .orElseThrow(() -> ApiException.conflict("BED_NOT_AVAILABLE",
                        "This Bed is not free any more. Choose another one."));
        if (bed.roomId() == p.roomId()) {
            throw FieldErrors.single("bedId", "Choose a Bed in another Room.");
        }
        if (!mayMoveInto(user, bed.buildingId())) {
            throw ApiException.forbidden("CROSS_BLOCK", "A move to another Block is decided by a Manager.");
        }
        return bed;
    }

    private Person person(long studentId) {
        UserDirectory.Student s = users.students(List.of(studentId)).get(studentId);
        return new Person(s == null ? null : s.name(), s == null ? null : s.studentCode());
    }

    private static Place place(Moves.Placement p, Names names) {
        return new Place(p.room(), p.bed(), p.block(), names.type(p.roomTypeId()), names.roomClass(p.roomClassId()));
    }

    private List<String> reasons() {
        return lookups.list("MOVE_REASON").stream().map(Lookups.Lookup::label).toList();
    }

    private String label(String code) {
        return code == null ? null : lookups.find("MOVE_REASON", code).map(Lookups.Lookup::label).orElse(code);
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

    private static Optional<Long> parse(String value) {
        if (value == null || value.isBlank() || value.length() > 18 || !value.trim().chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(value.trim()));
    }

    private static Move move(ResultSet rs, int i) throws SQLException {
        return new Move(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("student_id"), rs.getLong("from_bed_id"),
                rs.getLong("to_bed_id"), rs.getString("reason"), rs.getString("note"), rs.getString("next_term"),
                rs.getLong("moved_by"), rs.getTimestamp("moved_at").toInstant());
    }

}
