package vn.fpt.campusstay.service.assignment;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.EndOfStayNotice;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.Reconciliations;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.BlockSettings;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.FeePolicy;

/**
 * Issue next-Term fees (spec §5.1 M6, §6.10 step 4): a Manager previews then issues, in bulk, one Invoice per
 * continuing resident = 100 % of the next Term's price of the Bed's Room Type × the Room's Room Class in that Term
 * (no Deposit; the Utility Deposit stays held). Possible only once filing has closed, no next-Term request is open
 * and the enrolled list was reconciled. Leavers then receive their end-of-stay notice. Next-Term Beds are frozen from
 * here on (D-31): only a Manager moves a student, through an operational move.
 */
@Service
public class NextTermFeeService {

    public record TermRef(String id, String name) {
    }

    /** @param code {@code FILING_OPEN}, {@code REQUESTS_OPEN}, {@code NOT_RECONCILED}, {@code RECONCILIATION_OPEN},
     * {@code NO_PRICE} */
    public record Blocker(String code, String text) {
    }

    public record Group(String block, String roomType, String roomClass, long count, long total) {
    }

    /**
     * @param count     continuing residents who will receive a fee now; {@code total} their amount
     * @param issued    fees already issued: count, paid and their amount
     * @param leavers   residents of the current Term who do not continue (they receive the end-of-stay notice)
     */
    public record Preview(TermRef term, Instant dueAt, long count, long total, List<Group> groups,
            List<Blocker> blockers, Issued issued, long leavers) {
    }

    public record Issued(Instant at, String by, long count, long paid, long total) {
    }

    public record IssueResult(long issued, long total, long notices) {
    }

    private record Candidate(long allocationId, long studentId, Inventory.BedSlot bed, OptionalLong price) {
    }

    private static final DateTimeFormatter HOURS = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final JdbcStays stays;
    private final Inventory inventory;
    private final Catalog catalog;
    private final FeePolicy fees;
    private final Billing billing;
    private final BlockSettings blockSettings;
    private final OpenRenewalRequests openRequests;
    private final Reconciliations reconciliations;
    private final UserDirectory users;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public NextTermFeeService(JdbcClient jdbc, CurrentUser currentUser, JdbcStays stays, Inventory inventory,
            Catalog catalog, FeePolicy fees, Billing billing, BlockSettings blockSettings,
            OpenRenewalRequests openRequests, Reconciliations reconciliations,
            UserDirectory users, ApplicationEventPublisher events, AuditLog audit,
            Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.stays = stays;
        this.inventory = inventory;
        this.catalog = catalog;
        this.fees = fees;
        this.billing = billing;
        this.blockSettings = blockSettings;
        this.openRequests = openRequests;
        this.reconciliations = reconciliations;
        this.users = users;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Preview preview(long termId) {
        currentUser.require(Permission.ISSUE_TERM_FEES);
        Stays.Window w = window(termId);
        List<Candidate> candidates = candidates(w);
        Map<Long, String> types = catalog.roomTypes().stream()
                .collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name));
        Map<Long, String> classes = catalog.roomClasses().stream()
                .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name));
        Map<String, long[]> grouped = new LinkedHashMap<>();
        candidates.stream().filter(c -> c.price().isPresent())
                .sorted(Comparator.comparing((Candidate c) -> c.bed().block()).thenComparing(c -> c.bed().roomTypeId())
                        .thenComparing(c -> c.bed().roomClassId()))
                .forEach(c -> {
                    long[] g = grouped.computeIfAbsent(c.bed().block() + "\u0000" + types.get(c.bed().roomTypeId())
                            + "\u0000" + classes.get(c.bed().roomClassId()), k -> new long[2]);
                    g[0]++;
                    g[1] += c.price().getAsLong();
                });
        List<Group> groups = grouped.entrySet().stream().map(e -> {
            String[] k = e.getKey().split("\u0000", -1);
            return new Group(k[0], k[1], k[2], e.getValue()[0], e.getValue()[1]);
        }).toList();
        long total = candidates.stream().filter(c -> c.price().isPresent()).mapToLong(c -> c.price().getAsLong()).sum();
        return new Preview(new TermRef(String.valueOf(w.termId()), w.termName()), w.feesDueAt(),
                candidates.stream().filter(c -> c.price().isPresent()).count(), total, groups,
                blockers(w, candidates), issued(w), leavers(w).size());
    }

    @Transactional
    public IssueResult issue(long termId) {
        AuthenticatedUser user = currentUser.require(Permission.ISSUE_TERM_FEES);
        jdbc.sql("SELECT term_id FROM asg_renewal WHERE term_id = :t FOR UPDATE").param("t", termId)
                .query(Long.class).optional();
        Stays.Window w = window(termId);
        List<Candidate> candidates = candidates(w);
        List<Blocker> blockers = blockers(w, candidates);
        if (!blockers.isEmpty()) {
            throw ApiException.conflict("FEES_BLOCKED", blockers.getFirst().text());
        }
        long total = 0;
        for (Candidate c : candidates) {
            billing.issueTermFee(new Billing.TermFeeRequest(w.termId(), c.studentId(), c.allocationId(),
                    c.bed().buildingId(), c.bed().roomCode(), c.price().getAsLong(), w.feesDueAt()));
            total += c.price().getAsLong();
        }
        boolean first = w.feesIssuedAt() == null;
        if (first) {
            jdbc.sql("UPDATE asg_renewal SET fees_issued_at = :now, fees_issued_by = :by WHERE term_id = :t")
                    .param("now", Timestamp.from(Instant.now(clock))).param("by", user.userId())
                    .param("t", w.termId()).update();
        }
        long notices = first ? notifyLeavers(w) : 0;
        audit.record("NEXT_TERM_FEES_ISSUED", AuditLog.Tone.SUCCESS, "Term", w.termId(), w.termName(),
                Map.of("invoices", candidates.size(), "total", total, "endOfStayNotices", notices));
        return new IssueResult(candidates.size(), total, notices);
    }

    // ---------------------------------------------------------------- helpers

    /** Continuing residents whose next-Term Allocation has no live fee yet, with the next Term's price of their Bed. */
    private List<Candidate> candidates(Stays.Window w) {
        record Row(long id, long studentId, long bedId) {
        }
        List<Row> rows = jdbc.sql("""
                SELECT id, student_id, bed_id FROM asg_allocation
                WHERE term_id = :t AND status = 'ACTIVE' AND renewal = 'CONTINUING' ORDER BY id
                """).param("t", w.termId())
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getLong("student_id"), rs.getLong("bed_id"))).list();
        Map<Long, Billing.InvoiceLine> issued = billing.termFees(rows.stream().map(Row::id).toList());
        Map<Long, Inventory.BedSlot> beds = inventory.beds(w.termId(), rows.stream().map(Row::bedId).toList());
        List<Candidate> result = new ArrayList<>();
        for (Row r : rows) {
            Inventory.BedSlot bed = beds.get(r.bedId());
            if (issued.containsKey(r.id()) || bed == null) {
                continue;
            }
            result.add(new Candidate(r.id(), r.studentId(), bed,
                    fees.termPrice(w.termId(), bed.roomTypeId(), bed.roomClassId())));
        }
        return result;
    }

    private List<Blocker> blockers(Stays.Window w, List<Candidate> candidates) {
        List<Blocker> result = new ArrayList<>();
        Instant now = Instant.now(clock);
        if (w.filing(now) || w.closedAt() == null) {
            result.add(new Blocker("FILING_OPEN", "Students can still file next-Term requests until "
                    + WHEN
                            .format(w.closesAt()) + "."));
        }
        long open = openRequests.total(w.termId());
        if (open > 0) {
            result.add(new Blocker("REQUESTS_OPEN", open + " next-Term requests are still open. Decide them first."));
        }
        Reconciliations.Status rec = reconciliations.status(w.termId());
        if (rec.runs() == 0) {
            result.add(new Blocker("NOT_RECONCILED", "Reconcile the enrolled list for " + w.termName() + " first."));
        } else if (rec.openItems() > 0) {
            result.add(new Blocker("RECONCILIATION_OPEN", rec.openItems()
                    + " reconciliation items are still open. Resolve them first."));
        }
        candidates.stream().filter(c -> c.price().isEmpty()).findFirst().ifPresent(c -> result.add(new Blocker("NO_PRICE",
                "Room " + c.bed().roomCode() + " has no price in " + w.termName() + ". Ask the Admin to add it.")));
        return result;
    }

    private Issued issued(Stays.Window w) {
        List<Long> allocations = jdbc.sql("""
                SELECT id FROM asg_allocation WHERE term_id = :t AND renewal IS NOT NULL AND status = 'ACTIVE'
                """).param("t", w.termId()).query(Long.class).list();
        List<Billing.InvoiceLine> lines = List.copyOf(billing.termFees(allocations).values());
        if (lines.isEmpty() && w.feesIssuedAt() == null) {
            return null;
        }
        Long by = jdbc.sql("SELECT fees_issued_by FROM asg_renewal WHERE term_id = :t").param("t", w.termId())
                .query((rs, i) -> rs.getObject("fees_issued_by", Long.class)).optional().orElse(null);
        return new Issued(w.feesIssuedAt(), by == null ? null : users.displayNames(List.of(by)).get(by), lines.size(),
                lines.stream().filter(l -> l.status().equals("Paid")).count(),
                lines.stream().mapToLong(Billing.InvoiceLine::amount).sum());
    }

    private record Leaver(long allocationId, long studentId, long bedId) {
    }

    /** Residents of the current Term without a Bed in the next Term. */
    private List<Leaver> leavers(Stays.Window w) {
        return jdbc.sql("""
                SELECT a.id, a.student_id, a.bed_id FROM asg_allocation a
                WHERE a.term_id = :n AND a.status = 'ACTIVE' AND a.resident_at IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM asg_allocation x WHERE x.student_id = a.student_id AND x.term_id = :t
                                  AND x.status = 'ACTIVE')
                ORDER BY a.id
                """).param("n", w.previousTermId()).param("t", w.termId())
                .query((rs, i) -> new Leaver(rs.getLong("id"), rs.getLong("student_id"), rs.getLong("bed_id"))).list();
    }

    private long notifyLeavers(Stays.Window w) {
        List<Leaver> leavers = leavers(w);
        Map<Long, Inventory.BedSlot> beds = inventory.beds(leavers.stream().map(Leaver::bedId).toList());
        long sent = 0;
        for (Leaver l : leavers) {
            Inventory.BedSlot bed = beds.get(l.bedId());
            if (bed == null) {
                continue;
            }
            String hours = blockSettings.forBlock(bed.buildingId())
                    .map(s -> s.deskOpens().format(HOURS) + "–" + s.deskCloses().format(HOURS)).orElse(null);
            long held = billing.utilityDepositHeld(stays.allocationsOfStay(l.allocationId()));
            events.publishEvent(new EndOfStayNotice(l.studentId(), w.previousTermName(), bed.roomCode(), bed.block(),
                    w.previousCheckOutBy(), hours, held));
            sent++;
        }
        return sent;
    }

    private Stays.Window window(long termId) {
        Stays.Window w = stays.window(termId).orElseThrow(() -> ApiException.notFound(
                "This Term has no requests window: it has no renewal milestones."));
        if (w.openedAt() == null) {
            throw ApiException.conflict("WINDOW_NOT_OPEN", "The requests window of " + w.termName()
                    + " has not opened yet.");
        }
        return w;
    }
}
