package vn.fpt.campusstay.asg.internal;

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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.auth.AuthenticatedUser;
import vn.fpt.campusstay.auth.BlockDirectory;
import vn.fpt.campusstay.auth.BlockScope;
import vn.fpt.campusstay.auth.BlockSelection;
import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.auth.Permission;
import vn.fpt.campusstay.auth.UserDirectory;
import vn.fpt.campusstay.bil.Billing;
import vn.fpt.campusstay.cfg.Catalog;
import vn.fpt.campusstay.cfg.Lookups;
import vn.fpt.campusstay.cfg.TermCatalog;
import vn.fpt.campusstay.cfg.TermSummary;
import vn.fpt.campusstay.inv.Buildings;
import vn.fpt.campusstay.inv.Inventory;
import vn.fpt.campusstay.shared.audit.AuditLog;
import vn.fpt.campusstay.shared.error.ApiException;
import vn.fpt.campusstay.shared.error.FieldErrors;
import vn.fpt.campusstay.shared.time.TimeConfig;
import vn.fpt.campusstay.shared.web.PageQuery;

/**
 * The Check-in and Check-out desk. Check-in needs the Balance (with its
 * Utility Deposit) paid and today inside the Term's check-in window or an
 * approved late check-in. Check-out records the final meter reading and the
 * Room's condition; BIL settles the Utility Deposit and the refund goes to the
 * Block Manager. Allocations are addressed by id, never by student code (B-01).
 */
@Service
public class DeskService {

    // ---------------------------------------------------------------- check-in records

    public record Recent(String name, String bed, Instant at) {
    }

    public record Today(LocalDate date, String block, long expected, long checkedIn, long waiting, long blocked,
            List<Recent> recent) {
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

    public record CheckOutRow(String allocationId, String studentCode, String name, String room, String bed,
            String roomTypeName, String roomClassName, String reason, String status, Instant checkedOutAt) {
    }

    public record CheckOutPage(LocalDate date, long pendingCount, List<String> reasons, List<CheckOutRow> items,
            long total) {
    }

    public record Reading(BigDecimal electricity, BigDecimal water) {
    }

    public record SettlementView(long held, String periodLabel, long share, long unpaid, long damage, long refund) {
    }

    public record CheckOutDetail(String allocationId, String studentCode, String name, String room, String bed,
            String roomTypeName, String roomClassName, String reason, String status, Instant checkedOutAt,
            Reading reading, SettlementView settlement, String refundStatus) {
    }

    public record CheckOutCommand(BigDecimal electricity, BigDecimal water, Boolean conditionGood, Boolean keyReturned,
            Long damageCharge, boolean draft) {
    }

    public record CheckedOut(long refund, String refundStatus) {
    }

    // ---------------------------------------------------------------- internal rows

    private record Alloc(long id, long termId, long studentId, long bedId, String status, Instant checkedInAt,
            List<String> handOverItems) {
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
    private final Clock clock;

    public DeskService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, BlockDirectory blocks,
            Buildings buildings, TermCatalog terms, Inventory inventory, Catalog catalog, Lookups lookups,
            UserDirectory users, Billing billing, AuditLog audit, Clock clock) {
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
        return new Today(today, code, placed.size(), checkedIn, placed.size() - checkedIn - blocked, blocked,
                recent.stream().map(p -> new Recent(names.get(p.alloc().studentId()), p.bed().code(),
                        p.alloc().checkedInAt())).toList());
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
        Inventory.BedSlot bed = inventory.beds(List.of(a.bedId())).get(a.bedId());
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
        Inventory.BedSlot bed = inventory.beds(List.of(a.bedId())).get(a.bedId());
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
                       check_in_note = :note, version = version + 1
                WHERE id = :id AND status = 'ACTIVE' AND checked_in_at IS NULL
                """)
                .param("now", Timestamp.from(now)).param("by", user.userId())
                .param("items", handed.toArray(String[]::new))
                .param("note", note == null || note.isBlank() ? null : note.trim()).param("id", a.id()).update();
        if (updated == 0) {
            throw ApiException.conflict("ALREADY_CHECKED_IN", student.name() + " is already checked in.");
        }
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
        List<Placed> rows = checkOutRows(term.id(), scope.ids(), null);
        Map<Long, UserDirectory.StudentProfile> students = users.studentProfiles(
                rows.stream().map(p -> p.alloc().studentId()).toList());
        Names names = names();
        long pending = rows.stream().filter(p -> !"COMPLETED".equals(p.outStatus())).count();
        String needle = q == null || q.isBlank() ? null : fold(q.trim());
        String reasonCode = reason == null || reason.isBlank() ? null
                : lookups.find("CHECK_OUT_REASON", reason.trim())
                        .orElseThrow(() -> FieldErrors.single("reason", "Choose a reason from the list.")).code();
        List<CheckOutRow> items = rows.stream()
                .filter(p -> reasonCode == null || reasonCode.equals(p.reason()))
                .map(p -> row(p, students.get(p.alloc().studentId()), names))
                .filter(r -> needle == null || fold(r.name()).contains(needle) || fold(r.studentCode()).contains(needle)
                        || fold(r.room()).contains(needle))
                .sorted(Comparator.comparing((CheckOutRow r) -> r.status().equals("Checked out"))
                        .thenComparing(CheckOutRow::room).thenComparing(CheckOutRow::bed))
                .toList();
        return new CheckOutPage(today(), pending,
                lookups.list("CHECK_OUT_REASON").stream().map(Lookups.Lookup::label).toList(),
                items.stream().skip(page.offset()).limit(page.limit()).toList(), items.size());
    }

    @Transactional(readOnly = true)
    public CheckOutDetail checkOutDetail(String allocationId) {
        currentUser.require(Permission.DESK);
        Placed p = checkOutTarget(allocationId, false);
        OutRecord record = outRecord(p.alloc().id()).orElse(null);
        CheckOutRow row = row(p, users.studentProfile(p.alloc().studentId()).orElse(null), names());
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
        return new CheckOutDetail(row.allocationId(), row.studentCode(), row.name(), row.room(), row.bed(),
                row.roomTypeName(), row.roomClassName(), row.reason(), row.status(), row.checkedOutAt(), reading,
                settlement, refundStatus);
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
        errors.throwIfAny();
        long damage = cmd.damageCharge() == null ? 0 : cmd.damageCharge();
        Reading reading = new Reading(cmd.electricity(), cmd.water());
        Billing.SettlementRequest request = request(p, reading, damage);
        Instant now = Instant.now(clock);
        String reason = p.reason() == null ? DEFAULT_REASON : p.reason();

        if (cmd.draft()) {
            Billing.Settlement estimate = billing.estimateCheckOut(request);
            upsert(p.alloc().id(), reason, "DRAFT", cmd, damage, null, null, user.userId(), now);
            return new CheckedOut(estimate.refund(), null);
        }
        Billing.SettledCheckOut settled = billing.settleCheckOut(request, user.userId());
        upsert(p.alloc().id(), reason, "COMPLETED", cmd, damage, settled.settlement(),
                settled.refundId().isPresent() ? "PENDING" : "NONE", user.userId(), now);
        jdbc.sql("""
                UPDATE asg_allocation SET status = 'ENDED', ended_at = :now, end_reason = 'CHECK_OUT', version = version + 1
                WHERE id = :id AND status = 'ACTIVE'
                """).param("now", Timestamp.from(now)).param("id", p.alloc().id()).update();
        long refund = settled.settlement().refund();
        audit.record("CHECKED_OUT", AuditLog.Tone.SUCCESS, "Allocation", p.alloc().id(),
                "Room " + p.bed().roomCode() + " · Bed " + p.bed().bedLabel(),
                Map.of("refund", refund, "damage", damage, "conditionGood", cmd.conditionGood()));
        return new CheckedOut(refund, settled.refundId().isPresent() ? "Pending" : "None");
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
                p.bed().roomId(), p.bed().roomCode(), p.bed().buildingId(),
                reading == null ? null : reading.electricity(), reading == null ? null : reading.water(), damage,
                residents(p.bed().roomId(), p.alloc().termId()));
    }

    private int residents(long roomId, long termId) {
        List<Long> beds = inventory.bedsOfRoom(roomId).stream().map(Inventory.BedSlot::bedId).toList();
        return beds.isEmpty() ? 1 : Math.max(1, jdbc.sql("""
                SELECT count(*) FROM asg_allocation
                WHERE term_id = :term AND status = 'ACTIVE' AND checked_in_at IS NOT NULL AND bed_id IN (:beds)
                """).param("term", termId).param("beds", beds).query(Integer.class).single());
    }

    /** A checked-in or checked-out Allocation in the user's scope. */
    private Placed checkOutTarget(String allocationId, boolean lock) {
        long id = parseId(allocationId).orElseThrow(() -> ApiException.notFound("This Allocation does not exist."));
        Placed p = checkOutRows(null, null, id).stream().findFirst()
                .orElseThrow(() -> ApiException.notFound("This student is not checked in."));
        blockScope.check(p.bed().buildingId());
        if (lock) {
            jdbc.sql("SELECT id FROM asg_allocation WHERE id = :id FOR UPDATE").param("id", id).query(Long.class).single();
        }
        return p;
    }

    /** Checked-in Allocations and the ones ended by check-out, with their check-out record. */
    private List<Placed> checkOutRows(Long termId, Set<Long> scope, Long allocationId) {
        String where = allocationId != null ? "a.id = :id" : "a.term_id = :term";
        List<Object[]> raw = jdbc.sql("""
                SELECT a.*, c.reason AS out_reason, c.status AS out_status, c.completed_at AS out_completed
                FROM asg_allocation a LEFT JOIN asg_check_out c ON c.allocation_id = a.id
                WHERE %s AND ((a.status = 'ACTIVE' AND a.checked_in_at IS NOT NULL)
                              OR (a.status = 'ENDED' AND a.end_reason = 'CHECK_OUT'))
                """.formatted(where))
                .params(allocationId != null ? Map.of("id", allocationId) : Map.of("term", termId))
                .query((rs, i) -> new Object[] { alloc(rs, i), rs.getString("out_reason"), rs.getString("out_status"),
                        instant(rs, "out_completed") })
                .list();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(raw.stream().map(r -> ((Alloc) r[0]).bedId()).toList());
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

    private CheckOutRow row(Placed p, UserDirectory.StudentProfile student, Names names) {
        String reason = lookups.find("CHECK_OUT_REASON", p.reason() == null ? DEFAULT_REASON : p.reason())
                .map(Lookups.Lookup::label).orElse(p.reason());
        String status = "COMPLETED".equals(p.outStatus()) ? "Checked out"
                : "DRAFT".equals(p.outStatus()) ? "Draft" : "Pending";
        return new CheckOutRow(String.valueOf(p.alloc().id()), student == null ? null : student.studentCode(),
                student == null ? null : student.name(), p.bed().roomCode(), p.bed().bedLabel(),
                names.types().get(p.bed().roomTypeId()), names.classes().get(p.bed().roomClassId()), reason, status,
                p.completedAt());
    }

    private static SettlementView view(Billing.Settlement s) {
        return new SettlementView(s.held(), s.periodLabel(), s.share(), s.unpaid(), s.damage(), s.refund());
    }

    // ---------------------------------------------------------------- helpers

    /** Active Allocations of the Term with Beds in scope. */
    private List<Placed> active(long termId, Set<Long> scope) {
        List<Alloc> list = jdbc.sql("SELECT * FROM asg_allocation WHERE term_id = :term AND status = 'ACTIVE'")
                .param("term", termId).query(DeskService::alloc).list();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(list.stream().map(Alloc::bedId).toList());
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
                        .toList()));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
