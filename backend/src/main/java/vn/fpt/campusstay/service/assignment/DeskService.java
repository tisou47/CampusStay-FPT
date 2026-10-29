package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.event.FurnitureDamaged;
import vn.fpt.campusstay.event.ResidentLeftRoom;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.Lookups;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.inventory.Buildings;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.common.file.SheetFile;
import vn.fpt.campusstay.common.file.XlsxFile;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;

/**
 * The Check-in and Check-out desk. Since phase 5 the desk check-in only records the hand-over (D-19): residence
 * comes with the door code ({@link DoorCodeRelease}); a student whose Room has no code yet becomes a resident here.
 * Check-in needs the Balance (with its Utility Deposit) paid and today inside the Term's check-in window or an
 * approved late check-in. Check-out (every resident, with or without the desk check-in) records the final meter
 * reading and the Room's condition; Billing settles the Utility Deposit and the refund goes to its approver; a
 * terminated stay closes its termination. Allocations are addressed by id, never by student code (B-01).
 */
@Service
public class DeskService {

    // ---------------------------------------------------------------- check-in records

    public record Recent(String name, String bed, Instant at) {
    }

    /**
     * {@code expected} = every Allocation of the Term in the Blocks (not only today's arrivals). {@code window} is
     * {@code UPCOMING} before {@code checkInStart}, {@code OPEN} through {@code checkInEnd}, then {@code CLOSED}
     * (late check-ins are still recorded); null when the Term has no check-in days.
     */
    public record Today(LocalDate date, String block, long expected, long checkedIn, long waiting, long blocked,
            List<Recent> recent, String termId, String termName, LocalDate checkInStart, LocalDate checkInEnd,
            String window) {
    }

    public record Check(String label, boolean passed) {
    }

    public record Owes(long balance, long utilityDeposit) {
    }

    /** {@code status}: ready, blocked, checked-in or not-allocated. */
    public record Person(String name, String studentCode, String room, String bed, String block, Integer floor,
            String status, List<Check> checks, Owes owes, Instant checkedInAt, List<String> handOverItems) {
    }

    public record Lookup(Person student) {
    }

    public record CheckedIn(Instant checkedInAt) {
    }

    // ---------------------------------------------------------------- check-out records

    /** @param overdue the Term's check-out date passed and the student has not checked out (spec §6.16) */
    public record CheckOutRow(String allocationId, String studentCode, String name, String room, String bed,
            String roomTypeName, String roomClassName, String reason, String status, Instant checkedOutAt,
            boolean overdue) {
    }

    /** @param checkOutBy the day leavers of the Term must have checked out */
    public record CheckOutPage(LocalDate date, long pendingCount, List<String> reasons, List<CheckOutRow> items,
            long total, LocalDate checkOutBy, long overdueCount) {
    }

    /** Damage to one furniture item of the Room; {@code amount} VND. */
    public record Damage(String itemId, Long amount, String note) {
    }

    /** A furniture item of the Room with the damage recorded for it (0 when none). */
    public record DamageItem(String itemId, String assetCode, String type, String typeVi, long amount, String note) {
    }

    public record Reading(BigDecimal electricity, BigDecimal water) {
    }

    public record SettlementView(long held, String periodLabel, long share, long unpaid, long damage, long refund) {
    }

    public record CheckOutDetail(String allocationId, String studentCode, String name, String room, String bed,
            String roomTypeName, String roomClassName, String reason, String status, Instant checkedOutAt,
            Reading reading, SettlementView settlement, String refundStatus, List<DamageItem> furniture) {
    }

    /** @param damages per furniture item; when sent, the damage charge is their sum */
    public record CheckOutCommand(BigDecimal electricity, BigDecimal water, Boolean conditionGood, Boolean keyReturned,
            Long damageCharge, boolean draft, List<Damage> damages) {
    }

    public record CheckedOut(long refund, String refundStatus) {
    }

    // ---------------------------------------------------------------- internal rows

    private record Alloc(long id, long termId, long studentId, long bedId, String status, Instant checkedInAt,
            List<String> handOverItems, Instant residentAt) {
    }

    /** An Allocation with its Bed and, for check-out, its check-out record. */
    private record Placed(Alloc alloc, Inventory.BedSlot bed, String reason, String outStatus, Instant completedAt) {
    }

    private record OutRecord(String status, BigDecimal electricity, BigDecimal water, Long damage, Long held,
            Long share, Long unpaid, String period, Long settled) {
    }

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter SHORT_DAY = DateTimeFormatter.ofPattern("dd/MM");
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);
    private static final String PASS_PREFIX = "CSTAY-PASS:";
    private static final String DEFAULT_REASON = "TERM_END";

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blocks;
    private final Buildings buildings;
    private final TermCatalog terms;
    private final Inventory inventory;
    private final Catalog catalog;
    private final Lookups lookups;
    private final UserDirectory users;
    private final Billing billing;
    private final AuditLog audit;
    private final ApplicationEventPublisher events;
    private final TerminationService terminations;
    private final JdbcStays stays;
    private final Clock clock;

    public DeskService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, BlockDirectory blocks,
            Buildings buildings, TermCatalog terms, Inventory inventory, Catalog catalog, Lookups lookups,
            UserDirectory users, Billing billing, AuditLog audit, ApplicationEventPublisher events,
            TerminationService terminations, JdbcStays stays, Clock clock) {
        this.stays = stays;
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blocks = blocks;
        this.buildings = buildings;
        this.terms = terms;
        this.inventory = inventory;
        this.catalog = catalog;
        this.lookups = lookups;
        this.users = users;
        this.billing = billing;
        this.audit = audit;
        this.events = events;
        this.terminations = terminations;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- check-in

    @Transactional(readOnly = true)
    public Today today(Long termId, String block) {
        currentUser.require(Permission.DESK);
        BlockSelection scope = blockScope.resolve(block);
        TermSummary term = term(termId);
        List<Placed> placed = active(term.id(), scope.ids());
        Map<Long, Billing.CheckInDue> dues = billing.checkInDues(placed.stream().map(p -> p.alloc().id()).toList());
        long checkedIn = placed.stream().filter(p -> p.alloc().checkedInAt() != null).count();
        long blocked = placed.stream()
                .filter(p -> p.alloc().checkedInAt() == null && dues.containsKey(p.alloc().id())).count();
        LocalDate today = today();
        Instant start = today.atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant();
        List<Placed> recent = placed.stream()
                .filter(p -> p.alloc().checkedInAt() != null && !p.alloc().checkedInAt().isBefore(start))
                .sorted(Comparator.comparing((Placed p) -> p.alloc().checkedInAt()).reversed())
                .limit(8).toList();
        Map<Long, String> names = users.displayNames(recent.stream().map(p -> p.alloc().studentId()).toList());
        String code = scope.single() ? blocks.codesByIds(scope.ids()).get(scope.singleId()) : null;
        String window = term.checkInStart() == null || term.checkInEnd() == null ? null
                : today.isBefore(term.checkInStart()) ? "UPCOMING"
                : today.isAfter(term.checkInEnd()) ? "CLOSED" : "OPEN";
        return new Today(today, code, placed.size(), checkedIn, placed.size() - checkedIn - blocked, blocked,
                recent.stream().map(p -> new Recent(names.get(p.alloc().studentId()), p.bed().code(),
                        p.alloc().checkedInAt())).toList(),
                String.valueOf(term.id()), term.name(), term.checkInStart(), term.checkInEnd(), window);
    }

    /** @param q a student code, a name or the pass payload {@code CSTAY-PASS:<allocationId>} */
    @Transactional(readOnly = true)
    public Lookup lookup(Long termId, String q) {
        currentUser.require(Permission.DESK);
        Set<Long> scope = blockScope.resolve(null).ids();
        if (q == null || q.isBlank()) {
            throw FieldErrors.single("q", "Type a student code or a name, or scan the pass.");
        }
        String value = q.trim();
        TermSummary term = term(termId);
        Optional<Alloc> alloc;
        UserDirectory.StudentProfile student = null;
        if (value.toUpperCase(Locale.ROOT).startsWith(PASS_PREFIX)) {
            alloc = passAllocation(value);
        } else {
            student = users.studentByCode(value).orElse(null);
            if (student != null) {
                alloc = activeOf(student.userId(), term.id(), false);
            } else {
                alloc = byName(term.id(), scope, value);
            }
        }
        if (alloc.isEmpty()) {
            if (student == null || !buildings.gendersOf(scope).contains(student.gender())) {
                return new Lookup(null);
            }
            return new Lookup(new Person(student.name(), student.studentCode(), null, null, null, null, "not-allocated",
                    List.of(), null, null, List.of()));
        }
        Alloc a = alloc.get();
        Inventory.BedSlot bed = inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId());
        if (bed == null || !scope.contains(bed.buildingId())) {
            return new Lookup(null);
        }
        UserDirectory.StudentProfile profile = student != null ? student
                : users.studentProfile(a.studentId()).orElse(null);
        return new Lookup(person(a, bed, profile, terms.findPublished(a.termId()).orElse(term)));
    }

    @Transactional
    public CheckedIn checkIn(Long termId, String studentCode, List<String> items, String note) {
        AuthenticatedUser user = currentUser.require(Permission.DESK);
        UserDirectory.StudentProfile student = users.studentByCode(studentCode == null ? "" : studentCode.trim())
                .orElseThrow(() -> ApiException.notFound("No Bed is allocated to this student."));
        Alloc a = activeOf(student.userId(), termId, true)
                .orElseThrow(() -> ApiException.notFound("No Bed is allocated to this student."));
        Inventory.BedSlot bed = inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId());
        blockScope.check(bed.buildingId());
        if (a.checkedInAt() != null) {
            throw ApiException.conflict("ALREADY_CHECKED_IN",
                    student.name() + " checked in on " + WHEN.format(a.checkedInAt()) + ".");
        }
        TermSummary term = terms.findPublished(a.termId()).orElseThrow();
        Person person = person(a, bed, student, term);
        List<String> failed = person.checks().stream().filter(c -> !c.passed()).map(Check::label).toList();
        if (!failed.isEmpty()) {
            throw ApiException.conflict("CHECK_IN_BLOCKED", "Check-in is blocked: " + String.join("; ", failed) + ".");
        }
        Set<String> handed = new LinkedHashSet<>();
        for (String item : items == null ? List.<String>of() : items) {
            handed.add(lookups.find("HAND_OVER_ITEM", item == null ? "" : item.trim())
                    .orElseThrow(() -> FieldErrors.single("items", "Choose the hand-over items from the list."))
                    .label());
        }
        Instant now = Instant.now(clock);
        int updated = jdbc.sql("""
                UPDATE asg_allocation SET checked_in_at = :now, checked_in_by = :by, hand_over_items = :items,
                       check_in_note = :note, resident_at = coalesce(resident_at, :now), version = version + 1
                WHERE id = :id AND status = 'ACTIVE' AND checked_in_at IS NULL
                """)
                .param("now", Timestamp.from(now)).param("by", user.userId())
                .param("items", handed.toArray(String[]::new))
                .param("note", note == null || note.isBlank() ? null : note.trim()).param("id", a.id()).update();
        if (updated == 0) {
            throw ApiException.conflict("ALREADY_CHECKED_IN", student.name() + " is already checked in.");
        }
        stays.joinStay(a.id(), a.residentAt() == null ? now : a.residentAt());
        audit.record("CHECKED_IN", AuditLog.Tone.SUCCESS, "Allocation", a.id(), "Room " + bed.roomCode() + " · Bed "
                + bed.bedLabel(), Map.of("items", List.copyOf(handed)));
        return new CheckedIn(now);
    }

    private Person person(Alloc a, Inventory.BedSlot bed, UserDirectory.StudentProfile student, TermSummary term) {
        Optional<Billing.CheckInDue> due = billing.checkInDue(a.id());
        LocalDate today = today();
        List<Check> checks = new ArrayList<>();
        checks.add(new Check("Bed allocated for " + term.name(), true));
        checks.add(new Check("Balance paid", due.map(d -> d.balance() <= 0).orElse(true)));
        checks.add(new Check("Utility Deposit paid", due.map(d -> d.utilityDeposit() <= 0).orElse(true)));
        if (term.checkInStart() != null && term.checkInEnd() != null) {
            boolean inWindow = !today.isBefore(term.checkInStart()) && !today.isAfter(term.checkInEnd());
            Optional<LocalDate> late = inWindow ? Optional.empty() : lateDeadline(a.id(), today);
            checks.add(late.map(d -> new Check("Late check-in approved until " + DAY.format(d), true))
                    .orElseGet(() -> new Check("Within the check-in window (" + SHORT_DAY.format(term.checkInStart())
                            + " – " + DAY.format(term.checkInEnd()) + ")", inWindow)));
        }
        String status = a.checkedInAt() != null ? "checked-in"
                : checks.stream().allMatch(Check::passed) ? "ready" : "blocked";
        List<String> items = a.checkedInAt() != null ? a.handOverItems()
                : lookups.list("HAND_OVER_ITEM").stream().map(Lookups.Lookup::label).toList();
        return new Person(student == null ? null : student.name(), student == null ? null : student.studentCode(),
                bed.roomCode(), bed.bedLabel(), "Block " + bed.block(), bed.floor(), status, checks,
                due.map(d -> new Owes(d.balance(), d.utilityDeposit())).orElse(null), a.checkedInAt(), items);
    }

    private Optional<LocalDate> lateDeadline(long allocationId, LocalDate today) {
        return jdbc.sql("""
                SELECT deadline FROM asg_late_check_in
                WHERE allocation_id = :id AND status = 'APPROVED' AND deadline >= :today
                ORDER BY deadline DESC LIMIT 1
                """).param("id", allocationId).param("today", today).query(LocalDate.class).optional();
    }

    private Optional<Alloc> passAllocation(String value) {
        String id = value.substring(PASS_PREFIX.length()).trim();
        if (id.isEmpty() || id.length() > 18 || !id.chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return jdbc.sql("SELECT * FROM asg_allocation WHERE id = :id AND status = 'ACTIVE'")
                .param("id", Long.parseLong(id)).query(DeskService::alloc).optional();
    }

    /** The student's active Allocation in the Term; without a Term, the latest one not checked in yet. */
    private Optional<Alloc> activeOf(long studentId, Long termId, boolean lock) {
        return jdbc.sql("SELECT * FROM asg_allocation WHERE student_id = :student AND status = 'ACTIVE'"
                + (termId != null ? " AND term_id = :term" : "")
                + " ORDER BY checked_in_at IS NULL DESC, allocated_at DESC LIMIT 1" + (lock ? " FOR UPDATE" : ""))
                .params(termId != null ? Map.of("student", studentId, "term", termId) : Map.of("student", studentId))
                .query(DeskService::alloc).optional();
    }

    /** By name among the Term's Allocations in scope; several matches ask for the student code. */
    private Optional<Alloc> byName(long termId, Set<Long> scope, String name) {
        List<Placed> placed = active(termId, scope);
        Map<Long, String> names = users.displayNames(placed.stream().map(p -> p.alloc().studentId()).toList());
        String needle = fold(name);
        List<Alloc> matches = placed.stream().map(Placed::alloc)
                .filter(a -> names.get(a.studentId()) != null && fold(names.get(a.studentId())).contains(needle))
                .toList();
        if (matches.size() > 1) {
            throw ApiException.conflict("MANY_MATCHES", matches.size()
                    + " students match this name. Type the student code or scan the pass.");
        }
        return matches.stream().findFirst();
    }

    // ---------------------------------------------------------------- check-out

    @Transactional(readOnly = true)
    public CheckOutPage checkOutList(Long termId, String block, String q, String reason, PageQuery page) {
        currentUser.require(Permission.DESK);
        BlockSelection scope = blockScope.resolve(block);
        TermSummary term = term(termId);
        // Continuing residents keep living here in the next Term: they leave the list unless a check-out started.
        Set<Long> continuing = Set.copyOf(jdbc.sql("""
                SELECT student_id FROM asg_allocation
                WHERE status = 'ACTIVE' AND renewal IS NOT NULL AND term_id <> :t
                """).param("t", term.id()).query(Long.class).list());
        List<Placed> rows = checkOutRows(term.id(), scope.ids(), null).stream()
                .filter(p -> p.outStatus() != null || !continuing.contains(p.alloc().studentId())).toList();
        Map<Long, UserDirectory.StudentProfile> students = users.studentProfiles(
                rows.stream().map(p -> p.alloc().studentId()).toList());
        Names names = names();
        long pending = rows.stream().filter(p -> !"COMPLETED".equals(p.outStatus())).count();
        LocalDate checkOutBy = checkOutBy(term);
        boolean late = today().isAfter(checkOutBy);
        String needle = q == null || q.isBlank() ? null : fold(q.trim());
        String reasonCode = reason == null || reason.isBlank() ? null
                : lookups.find("CHECK_OUT_REASON", reason.trim())
                        .orElseThrow(() -> FieldErrors.single("reason", "Choose a reason from the list.")).code();
        List<CheckOutRow> items = rows.stream()
                .filter(p -> reasonCode == null || reasonCode.equals(p.reason()))
                .map(p -> row(p, students.get(p.alloc().studentId()), names, late))
                .filter(r -> needle == null || fold(r.name()).contains(needle) || fold(r.studentCode()).contains(needle)
                        || fold(r.room()).contains(needle))
                .sorted(Comparator.comparing((CheckOutRow r) -> r.status().equals("Checked out"))
                        .thenComparing(CheckOutRow::room).thenComparing(CheckOutRow::bed))
                .toList();
        return new CheckOutPage(today(), pending,
                lookups.list("CHECK_OUT_REASON").stream().map(Lookups.Lookup::label).toList(),
                items.stream().skip(page.offset()).limit(page.limit()).toList(), items.size(), checkOutBy,
                items.stream().filter(CheckOutRow::overdue).count());
    }

    @Transactional(readOnly = true)
    public CheckOutDetail checkOutDetail(String allocationId) {
        currentUser.require(Permission.DESK);
        Placed p = checkOutTarget(allocationId, false);
        OutRecord record = outRecord(p.alloc().id()).orElse(null);
        CheckOutRow row = row(p, users.studentProfile(p.alloc().studentId()).orElse(null), names(),
                today().isAfter(checkOutBy(term(p.alloc().termId()))));
        Reading reading = record == null || record.electricity() == null ? null
                : new Reading(record.electricity(), record.water());
        SettlementView settlement;
        String refundStatus = null;
        if (record != null && "COMPLETED".equals(record.status())) {
            settlement = new SettlementView(nz(record.held()), record.period(), nz(record.share()), nz(record.unpaid()),
                    nz(record.damage()), nz(record.settled()));
            refundStatus = billing.checkOutRefundStatus(p.alloc().id()).orElse("None");
        } else {
            long damage = record == null ? 0 : nz(record.damage());
            Billing.Settlement s;
            try {
                s = billing.estimateCheckOut(request(p, reading, damage));
            } catch (ApiException e) {
                s = billing.estimateCheckOut(request(p, null, damage)); // a draft reading below the last one
            }
            settlement = view(s);
        }
        Map<Long, Damage> damages = new HashMap<>();
        if (record != null) {
            jdbc.sql("""
                    SELECT d.furniture_item_id, d.amount, d.note FROM asg_check_out_damage d
                    JOIN asg_check_out c ON c.id = d.check_out_id WHERE c.allocation_id = :a
                    """).param("a", p.alloc().id())
                    .query((rs, i) -> Map.entry(rs.getLong("furniture_item_id"), new Damage(null, rs.getLong("amount"),
                            rs.getString("note")))).list()
                    .forEach(e -> damages.put(e.getKey(), e.getValue()));
        }
        List<DamageItem> furniture = inventory.furnitureOf(p.bed().roomId()).stream().map(f -> {
            Damage d = damages.get(f.id());
            return new DamageItem(String.valueOf(f.id()), f.assetCode(), f.type(), f.typeVi(), d == null ? 0 : d.amount(),
                    d == null ? null : d.note());
        }).toList();
        return new CheckOutDetail(row.allocationId(), row.studentCode(), row.name(), row.room(), row.bed(),
                row.roomTypeName(), row.roomClassName(), row.reason(), row.status(), row.checkedOutAt(), reading,
                settlement, refundStatus, furniture);
    }

    @Transactional
    public CheckedOut checkOut(String allocationId, CheckOutCommand cmd) {
        AuthenticatedUser user = currentUser.require(Permission.DESK);
        Placed p = checkOutTarget(allocationId, true);
        if ("COMPLETED".equals(p.outStatus())) {
            throw ApiException.conflict("ALREADY_CHECKED_OUT", "This student has already checked out.");
        }
        FieldErrors errors = new FieldErrors();
        errors.check(cmd.electricity() != null, "electricity", "Enter the electricity reading.");
        errors.check(cmd.water() != null, "water", "Enter the water reading.");
        errors.check(cmd.conditionGood() != null, "conditionGood", "Say whether the Room is in good condition.");
        errors.check(cmd.keyReturned() != null, "keyReturned", "Say whether the key was returned.");
        if (!cmd.draft() && Boolean.FALSE.equals(cmd.keyReturned())) {
            errors.add("keyReturned", "Collect the Room key before you confirm.");
        }
        Map<Long, Damage> damages = damages(cmd.damages(), p.bed().roomId(), errors);
        errors.throwIfAny();
        long damage = cmd.damages() != null
                ? damages.values().stream().mapToLong(Damage::amount).sum()
                : cmd.damageCharge() == null ? 0 : cmd.damageCharge();
        Reading reading = new Reading(cmd.electricity(), cmd.water());
        Billing.SettlementRequest request = request(p, reading, damage);
        Instant now = Instant.now(clock);
        String reason = p.reason() == null ? DEFAULT_REASON : p.reason();

        if (cmd.draft()) {
            Billing.Settlement estimate = billing.estimateCheckOut(request);
            upsert(p.alloc().id(), reason, "DRAFT", cmd, damage, null, null, user.userId(), now);
            saveDamages(p.alloc().id(), cmd.damages() == null ? null : damages);
            return new CheckedOut(estimate.refund(), null);
        }
        Billing.SettledCheckOut settled = billing.settleCheckOut(request, user.userId());
        upsert(p.alloc().id(), reason, "COMPLETED", cmd, damage, settled.settlement(),
                settled.refundId().isPresent() ? "PENDING" : "NONE", user.userId(), now);
        saveDamages(p.alloc().id(), cmd.damages() == null ? null : damages);
        String where = "Room " + p.bed().roomCode() + " · Bed " + p.bed().bedLabel();
        damages.forEach((itemId, d) -> events.publishEvent(new FurnitureDamaged(itemId,
                "Damaged at the check-out of " + where + (d.note() == null ? "" : ": " + d.note()), user.userId())));
        jdbc.sql("""
                UPDATE asg_allocation SET status = 'ENDED', ended_at = :now, end_reason = 'CHECK_OUT', version = version + 1
                WHERE id = :id AND status = 'ACTIVE'
                """).param("now", Timestamp.from(now)).param("id", p.alloc().id()).update();
        if (p.alloc().residentAt() != null) {
            events.publishEvent(new ResidentLeftRoom(p.bed().roomId(), "CHECK_OUT"));
        }
        boolean terminated = terminations.checkedOut(p.alloc().id(), user.userId());
        // A resident who leaves now does not continue: a Bed held for the next Term is released.
        jdbc.sql("""
                SELECT id FROM asg_allocation
                WHERE student_id = :s AND status = 'ACTIVE' AND renewal IS NOT NULL AND id <> :id
                """).param("s", p.alloc().studentId()).param("id", p.alloc().id()).query(Long.class).list()
                .forEach(id -> stays.cancel(id, terminated ? "TERMINATED" : "END_OF_STAY"));
        stays.endIfLeft(p.alloc().studentId(), terminated);
        long refund = settled.settlement().refund();
        audit.record("CHECKED_OUT", AuditLog.Tone.SUCCESS, "Allocation", p.alloc().id(),
                "Room " + p.bed().roomCode() + " · Bed " + p.bed().bedLabel(),
                Map.of("refund", refund, "damage", damage, "conditionGood", cmd.conditionGood()));
        return new CheckedOut(refund, settled.refundId().isPresent() ? "Pending" : "None");
    }

    // ---------------------------------------------------------------- final meter readings, Room by Room

    /** A Room with leavers waiting: the reading saved on their drafts (null when none yet). */
    public record RoomReading(String room, int students, BigDecimal electricity, BigDecimal water) {
    }

    public record RoomReadings(List<RoomReading> items) {
    }

    /** @param line the file's line (1 = the header), 0 when typed on the page */
    public record ReadingLine(int line, String room, BigDecimal electricity, BigDecimal water) {
    }

    public record ReadingProblem(int line, String room, String message) {
    }

    public record ReadingsSaved(int rooms, int students, List<ReadingProblem> problems) {
    }

    /**
     * The Rooms whose leavers have not checked out yet, with the reading already saved on their drafts: the desk
     * enters the final meter readings Room by Room (or from a file) before the students come, and each check-out
     * then opens with it (spec §6.16).
     */
    @Transactional(readOnly = true)
    public RoomReadings roomReadings(Long termId, String block) {
        currentUser.require(Permission.DESK);
        Map<String, List<Placed>> rooms = waitingByRoom(term(termId).id(), blockScope.resolve(block).ids());
        List<RoomReading> items = new ArrayList<>();
        rooms.forEach((room, placed) -> {
            OutRecord saved = placed.stream().map(p -> outRecord(p.alloc().id()).orElse(null))
                    .filter(r -> r != null && r.electricity() != null).findFirst().orElse(null);
            items.add(new RoomReading(room, placed.size(), saved == null ? null : saved.electricity(),
                    saved == null ? null : saved.water()));
        });
        return new RoomReadings(items);
    }

    /** The template to fill in Excel: one line per Room with leavers waiting, the readings saved so far filled in. */
    @Transactional(readOnly = true)
    public byte[] roomReadingsTemplate(Long termId, String block) {
        List<List<String>> rows = new ArrayList<>();
        rows.add(List.of("room", "electricity", "water"));
        for (RoomReading r : roomReadings(termId, block).items()) {
            rows.add(List.of(r.room(), r.electricity() == null ? "" : r.electricity().toPlainString(),
                    r.water() == null ? "" : r.water().toPlainString()));
        }
        return XlsxFile.of("Readings", rows);
    }

    /** Reads the template back (CSV or XLSX; headers room/phòng, electricity/điện, water/nước). */
    @Transactional
    public ReadingsSaved saveRoomReadingsFile(Long termId, String block, String fileName, byte[] bytes) {
        currentUser.require(Permission.DESK);
        List<List<String>> table = SheetFile.rows(fileName, bytes);
        if (table.isEmpty()) {
            throw FieldErrors.single("file", "The file is empty.");
        }
        List<String> header = table.getFirst().stream().map(SheetFile::key).toList();
        int room = column(header, "room", "phong", "maphong");
        int electricity = column(header, "electricity", "dien", "sodien", "chisodien");
        int water = column(header, "water", "nuoc", "sonuoc", "chisonuoc");
        if (room < 0 || electricity < 0 || water < 0) {
            throw FieldErrors.single("file", "The file needs the columns room, electricity and water.");
        }
        List<ReadingLine> lines = new ArrayList<>();
        List<ReadingProblem> problems = new ArrayList<>();
        for (int i = 1; i < table.size(); i++) {
            List<String> row = table.get(i);
            String code = cell(row, room);
            String e = cell(row, electricity);
            String w = cell(row, water);
            if (code.isEmpty() || e.isEmpty() && w.isEmpty()) {
                continue; // a Room left blank is filled in later
            }
            BigDecimal ev = number(e);
            BigDecimal wv = number(w);
            if (ev == null || wv == null) {
                problems.add(new ReadingProblem(i + 1, code, "Enter both readings as numbers."));
                continue;
            }
            lines.add(new ReadingLine(i + 1, code, ev, wv));
        }
        ReadingsSaved saved = saveRoomReadings(termId, block, lines);
        problems.addAll(saved.problems());
        return new ReadingsSaved(saved.rooms(), saved.students(), problems);
    }

    /**
     * Saves each Room's final reading on the check-out drafts of all its leavers (their condition, key and damages
     * stay as they are). A Room without leavers or a reading below the Room's last one is reported, not saved.
     */
    @Transactional
    public ReadingsSaved saveRoomReadings(Long termId, String block, List<ReadingLine> lines) {
        AuthenticatedUser user = currentUser.require(Permission.DESK);
        Map<String, List<Placed>> rooms = waitingByRoom(term(termId).id(), blockScope.resolve(block).ids());
        Map<String, String> codes = new HashMap<>();
        rooms.keySet().forEach(r -> codes.put(r.toUpperCase(Locale.ROOT), r));
        List<ReadingProblem> problems = new ArrayList<>();
        int savedRooms = 0;
        int savedStudents = 0;
        Instant now = Instant.now(clock);
        for (ReadingLine l : lines == null ? List.<ReadingLine>of() : lines) {
            String room = l.room() == null ? null : codes.get(l.room().trim().toUpperCase(Locale.ROOT));
            if (room == null) {
                problems.add(new ReadingProblem(l.line(), l.room(), "No student is waiting to check out of this Room."));
                continue;
            }
            if (l.electricity() == null || l.water() == null || l.electricity().signum() < 0 || l.water().signum() < 0) {
                problems.add(new ReadingProblem(l.line(), room, "Enter both readings as numbers of 0 or more."));
                continue;
            }
            Reading reading = new Reading(l.electricity(), l.water());
            List<Placed> leavers = rooms.get(room);
            Optional<String> problem = billing.readingProblem(leavers.getFirst().bed().roomId(), reading.electricity(),
                    reading.water());
            if (problem.isPresent()) {
                problems.add(new ReadingProblem(l.line(), room, problem.get()));
                continue;
            }
            for (Placed p : leavers) {
                jdbc.sql("""
                        INSERT INTO asg_check_out (allocation_id, reason, status, electricity, water, draft_by, updated_at)
                        VALUES (:allocation, :reason, 'DRAFT', :electricity, :water, :by, :now)
                        ON CONFLICT (allocation_id) DO UPDATE SET
                            status = 'DRAFT', electricity = EXCLUDED.electricity, water = EXCLUDED.water,
                            draft_by = EXCLUDED.draft_by, updated_at = EXCLUDED.updated_at,
                            version = asg_check_out.version + 1
                        WHERE asg_check_out.status <> 'COMPLETED'
                        """).param("allocation", p.alloc().id())
                        .param("reason", p.reason() == null ? DEFAULT_REASON : p.reason())
                        .param("electricity", l.electricity()).param("water", l.water()).param("by", user.userId())
                        .param("now", Timestamp.from(now)).update();
            }
            savedRooms++;
            savedStudents += leavers.size();
        }
        if (savedRooms > 0) {
            audit.record("CHECK_OUT_READINGS", AuditLog.Tone.INFO, "Check-out", null, savedRooms + " Rooms",
                    Map.of("rooms", savedRooms, "students", savedStudents));
        }
        return new ReadingsSaved(savedRooms, savedStudents, problems);
    }

    /** Leavers not checked out yet, by Room code (continuing residents stay unless their check-out started). */
    private Map<String, List<Placed>> waitingByRoom(long termId, Set<Long> scope) {
        Set<Long> continuing = Set.copyOf(jdbc.sql("""
                SELECT student_id FROM asg_allocation
                WHERE status = 'ACTIVE' AND renewal IS NOT NULL AND term_id <> :t
                """).param("t", termId).query(Long.class).list());
        // Room codes in reading order: A-110 before A-1003.
        Map<String, List<Placed>> rooms = new TreeMap<>(Comparator.comparing((String r) -> r.replaceAll("\\d+", ""))
                .thenComparingLong(r -> Long.parseLong("0" + r.replaceAll("\\D+", ""))).thenComparing(r -> r));
        checkOutRows(termId, scope, null).stream()
                .filter(p -> !"COMPLETED".equals(p.outStatus()))
                .filter(p -> p.outStatus() != null || !continuing.contains(p.alloc().studentId()))
                .forEach(p -> rooms.computeIfAbsent(p.bed().roomCode(), k -> new ArrayList<>()).add(p));
        return rooms;
    }

    private static int column(List<String> header, String... names) {
        for (String n : names) {
            int i = header.indexOf(n);
            if (i >= 0) {
                return i;
            }
        }
        return -1;
    }

    private static String cell(List<String> row, int i) {
        return i < row.size() && row.get(i) != null ? row.get(i).trim() : "";
    }

    private static BigDecimal number(String s) {
        try {
            return new BigDecimal(s.replace(',', '.'));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** The damages sent, by furniture item of the Room; an item may be listed once. */
    private Map<Long, Damage> damages(List<Damage> input, long roomId, FieldErrors errors) {
        Map<Long, Damage> damages = new LinkedHashMap<>();
        if (input == null) {
            return damages;
        }
        Set<Long> items = inventory.furnitureOf(roomId).stream().map(Inventory.RoomFurniture::id)
                .collect(Collectors.toSet());
        for (Damage d : input) {
            Long id = d == null ? null : parseId(d.itemId()).orElse(null);
            if (id == null || !items.contains(id) || damages.containsKey(id)) {
                errors.add("damages", "List each damaged item of this Room once.");
                return damages;
            }
            long amount = d.amount() == null ? 0 : d.amount();
            if (amount < 0 || amount > 1_000_000_000) {
                errors.add("damages", "Enter a damage amount of 0 or more.");
                return damages;
            }
            String note = d.note() == null || d.note().isBlank() ? null : d.note().trim();
            if (note != null && note.length() > 300) {
                errors.add("damages", "Keep each damage note under 300 characters.");
                return damages;
            }
            if (amount > 0 || note != null) {
                damages.put(id, new Damage(String.valueOf(id), amount, note));
            }
        }
        return damages;
    }

    /** Replaces the check-out's damage lines; null leaves them as they are (an older client). */
    private void saveDamages(long allocationId, Map<Long, Damage> damages) {
        if (damages == null) {
            return;
        }
        long checkOutId = jdbc.sql("SELECT id FROM asg_check_out WHERE allocation_id = :a").param("a", allocationId)
                .query(Long.class).single();
        jdbc.sql("DELETE FROM asg_check_out_damage WHERE check_out_id = :c").param("c", checkOutId).update();
        damages.forEach((itemId, d) -> jdbc.sql("""
                INSERT INTO asg_check_out_damage (check_out_id, furniture_item_id, amount, note)
                VALUES (:c, :item, :amount, :note)
                """).param("c", checkOutId).param("item", itemId).param("amount", d.amount()).param("note", d.note())
                .update());
    }

    /** The day leavers of the Term must have checked out: N's date in the next Term's renewal, else the day after the stay. */
    private LocalDate checkOutBy(TermSummary term) {
        return terms.renewals().stream().filter(r -> r.previousTermId() == term.id()).findFirst()
                .map(TermCatalog.Renewal::previousCheckOutBy).orElse(term.stayEnd().plusDays(1));
    }

    private void upsert(long allocationId, String reason, String status, CheckOutCommand cmd, long damage,
            Billing.Settlement s, String refundStatus, long by, Instant now) {
        boolean done = status.equals("COMPLETED");
        jdbc.sql("""
                INSERT INTO asg_check_out (allocation_id, reason, status, electricity, water, condition_good, key_returned,
                                           damage_charge, refund_amount, refund_status, completed_at, completed_by,
                                           deposit_held, utility_share, unpaid_utility, share_period, settled_amount,
                                           draft_by, updated_at)
                VALUES (:allocation, :reason, :status, :electricity, :water, :good, :key, :damage, :refundAmount,
                        :refundStatus, :completedAt, :completedBy, :held, :share, :unpaid, :period, :settled, :by, :now)
                ON CONFLICT (allocation_id) DO UPDATE SET
                    status = EXCLUDED.status, electricity = EXCLUDED.electricity, water = EXCLUDED.water,
                    condition_good = EXCLUDED.condition_good, key_returned = EXCLUDED.key_returned,
                    damage_charge = EXCLUDED.damage_charge, refund_amount = EXCLUDED.refund_amount,
                    refund_status = EXCLUDED.refund_status, completed_at = EXCLUDED.completed_at,
                    completed_by = EXCLUDED.completed_by, deposit_held = EXCLUDED.deposit_held,
                    utility_share = EXCLUDED.utility_share, unpaid_utility = EXCLUDED.unpaid_utility,
                    share_period = EXCLUDED.share_period, settled_amount = EXCLUDED.settled_amount,
                    draft_by = EXCLUDED.draft_by, updated_at = EXCLUDED.updated_at, version = asg_check_out.version + 1
                WHERE asg_check_out.status <> 'COMPLETED'
                """)
                .param("allocation", allocationId).param("reason", reason).param("status", status)
                .param("electricity", cmd.electricity()).param("water", cmd.water())
                .param("good", cmd.conditionGood()).param("key", cmd.keyReturned()).param("damage", damage)
                .param("refundAmount", s == null ? null : Math.max(0, s.refund()))
                .param("refundStatus", refundStatus)
                .param("completedAt", done ? Timestamp.from(now) : null).param("completedBy", done ? by : null)
                .param("held", s == null ? null : s.held()).param("share", s == null ? null : s.share())
                .param("unpaid", s == null ? null : s.unpaid()).param("period", s == null ? null : s.periodLabel())
                .param("settled", s == null ? null : s.refund()).param("by", by)
                .param("now", Timestamp.from(now)).update();
    }

    private Billing.SettlementRequest request(Placed p, Reading reading, long damage) {
        return new Billing.SettlementRequest(p.alloc().termId(), p.alloc().studentId(), p.alloc().id(),
                stays.allocationsOfStay(p.alloc().id()), p.bed().roomId(), p.bed().roomCode(), p.bed().buildingId(),
                reading == null ? null : reading.electricity(), reading == null ? null : reading.water(), damage,
                residents(p.bed().roomId(), p.alloc().termId()));
    }

    private int residents(long roomId, long termId) {
        List<Long> beds = inventory.bedsOfRoom(roomId).stream().map(Inventory.BedSlot::bedId).toList();
        return beds.isEmpty() ? 1 : Math.max(1, jdbc.sql("""
                SELECT count(*) FROM asg_allocation
                WHERE term_id = :term AND status = 'ACTIVE' AND resident_at IS NOT NULL AND bed_id IN (:beds)
                """).param("term", termId).param("beds", beds).query(Integer.class).single());
    }

    /** A resident's or a checked-out Allocation in the user's scope. */
    private Placed checkOutTarget(String allocationId, boolean lock) {
        long id = parseId(allocationId).orElseThrow(() -> ApiException.notFound("This Allocation does not exist."));
        Placed p = checkOutRows(null, null, id).stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("This student does not live in the Room."));
        blockScope.check(p.bed().buildingId());
        if (lock) {
            jdbc.sql("SELECT id FROM asg_allocation WHERE id = :id FOR UPDATE").param("id", id).query(Long.class).single();
        }
        return p;
    }

    /** Residents' Allocations and the ones ended by check-out, with their check-out record. */
    private List<Placed> checkOutRows(Long termId, Set<Long> scope, Long allocationId) {
        String where = allocationId != null ? "a.id = :id" : "a.term_id = :term";
        List<Object[]> raw = jdbc.sql("""
                SELECT a.*, c.reason AS out_reason, c.status AS out_status, c.completed_at AS out_completed
                FROM asg_allocation a LEFT JOIN asg_check_out c ON c.allocation_id = a.id
                WHERE %s AND ((a.status = 'ACTIVE' AND a.resident_at IS NOT NULL)
                              OR (a.status = 'ENDED' AND a.end_reason = 'CHECK_OUT'))
                """.formatted(where))
                .params(allocationId != null ? Map.of("id", allocationId) : Map.of("term", termId))
                .query((rs, i) -> new Object[] { alloc(rs, i), rs.getString("out_reason"), rs.getString("out_status"),
                        instant(rs, "out_completed") })
                .list();
        Map<Long, Inventory.BedSlot> beds = beds(raw.stream().map(r -> (Alloc) r[0]).toList());
        List<Placed> result = new ArrayList<>();
        for (Object[] r : raw) {
            Alloc a = (Alloc) r[0];
            Inventory.BedSlot bed = beds.get(a.bedId());
            if (bed != null && (scope == null || scope.contains(bed.buildingId()))) {
                result.add(new Placed(a, bed, (String) r[1], (String) r[2], (Instant) r[3]));
            }
        }
        return result;
    }

    private Optional<OutRecord> outRecord(long allocationId) {
        return jdbc.sql("SELECT * FROM asg_check_out WHERE allocation_id = :id").param("id", allocationId)
                .query((rs, i) -> new OutRecord(rs.getString("status"), rs.getBigDecimal("electricity"),
                        rs.getBigDecimal("water"), rs.getObject("damage_charge", Long.class),
                        rs.getObject("deposit_held", Long.class), rs.getObject("utility_share", Long.class),
                        rs.getObject("unpaid_utility", Long.class), rs.getString("share_period"),
                        rs.getObject("settled_amount", Long.class)))
                .optional();
    }

    private CheckOutRow row(Placed p, UserDirectory.StudentProfile student, Names names, boolean late) {
        String reason = lookups.find("CHECK_OUT_REASON", p.reason() == null ? DEFAULT_REASON : p.reason())
                .map(Lookups.Lookup::label).orElse(p.reason());
        String status = "COMPLETED".equals(p.outStatus()) ? "Checked out"
                : "DRAFT".equals(p.outStatus()) ? "Draft" : "Pending";
        return new CheckOutRow(String.valueOf(p.alloc().id()), student == null ? null : student.studentCode(),
                student == null ? null : student.name(), p.bed().roomCode(), p.bed().bedLabel(),
                names.types().get(p.bed().roomTypeId()), names.classes().get(p.bed().roomClassId()), reason, status,
                p.completedAt(), late && !"COMPLETED".equals(p.outStatus()));
    }

    private static SettlementView view(Billing.Settlement s) {
        return new SettlementView(s.held(), s.periodLabel(), s.share(), s.unpaid(), s.damage(), s.refund());
    }

    // ---------------------------------------------------------------- helpers

    /** The Beds of the Allocations, each with its Room's class in the Allocation's Term. */
    private Map<Long, Inventory.BedSlot> beds(List<Alloc> allocations) {
        Map<Long, Inventory.BedSlot> result = new HashMap<>();
        allocations.stream().collect(Collectors.groupingBy(Alloc::termId))
                .forEach((term, list) -> result.putAll(inventory.beds(term, list.stream().map(Alloc::bedId).toList())));
        return result;
    }

    /** Active Allocations of the Term with Beds in scope. */
    private List<Placed> active(long termId, Set<Long> scope) {
        List<Alloc> list = jdbc.sql("SELECT * FROM asg_allocation WHERE term_id = :term AND status = 'ACTIVE'")
                .param("term", termId).query(DeskService::alloc).list();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(termId, list.stream().map(Alloc::bedId).toList());
        return list.stream().filter(a -> beds.get(a.bedId()) != null && scope.contains(beds.get(a.bedId()).buildingId()))
                .map(a -> new Placed(a, beds.get(a.bedId()), null, null, null)).toList();
    }

    private TermSummary term(Long termId) {
        if (termId != null) {
            return terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        }
        return terms.publishedTerms().stream().filter(TermSummary::current).findFirst()
                .or(terms::openForRegistration)
                .orElseThrow(() -> ApiException.notFound("No Term is published yet."));
    }

    private LocalDate today() {
        return LocalDate.ofInstant(Instant.now(clock), TimeConfig.CAMPUS_ZONE);
    }

    private record Names(Map<Long, String> types, Map<Long, String> classes) {
    }

    private Names names() {
        return new Names(
                catalog.roomTypes().stream().collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name)),
                catalog.roomClasses().stream()
                        .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name)));
    }

    /** Lower case without Vietnamese diacritics, so "nguyen van" finds "Nguyễn Văn". */
    private static String fold(String s) {
        if (s == null) {
            return "";
        }
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").replace('đ', 'd').replace('Đ', 'D')
                .toLowerCase(Locale.ROOT);
    }

    private static Optional<Long> parseId(String value) {
        if (value == null || value.isBlank() || value.length() > 18 || !value.trim().chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(value.trim()));
    }

    private static long nz(Long value) {
        return value == null ? 0 : value;
    }

    private static Alloc alloc(ResultSet rs, int i) throws SQLException {
        Array items = rs.getArray("hand_over_items");
        List<String> list = items == null ? List.of() : Arrays.asList((String[]) items.getArray());
        return new Alloc(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("student_id"), rs.getLong("bed_id"),
                rs.getString("status"), instant(rs, "checked_in_at"), List.copyOf(list.stream().filter(Objects::nonNull)
                        .toList()), instant(rs, "resident_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
