package vn.fpt.campusstay.service.report;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.config.TimeConfig;

/**
 * Dashboards of Staff, the Block Manager and the Admin, and the Manager's approval
 * counts. Everything is read from the reporting views ({@code rpt_v_*}). Before the first
 * Term is published they answer with the Term's figures at zero (the Admin's {@code term}
 * is null) instead of 404, so a new system still shows its checks and Blocks.
 */
@Service
public class DashboardService {

    /**
     * One line of a "needs your attention" list. {@code severity} info, warning, error or neutral. {@code title},
     * {@code body} and {@code cta} are English; a client that writes its own words reads {@code kind} and
     * {@code values} (the numbers, codes and dates of the line; keys per kind in contract change A-63).
     */
    public record Attention(String id, String kind, String severity, String title, String body, String link,
            String cta, Map<String, Object> values) {
    }

    // ---------------------------------------------------------------- Staff

    public record Proposal(String runId, long proposed, long requested, long conflicts, long waitlisted,
            long committedBlocks, long totalBlocks) {
    }

    public record OutOfService(String room, Instant since) {
    }

    public record StaffKpis(long toReview, long submitted, long underReview, long paymentsToConfirm, Proposal proposal,
            long roomsOutOfService, OutOfService firstOutOfService) {
    }

    public record StatusCount(String status, long count) {
    }

    public record PlanDay(LocalDate date, long morning, long afternoon) {
    }

    public record CheckInPlan(LocalDate start, LocalDate end, List<PlanDay> days) {
    }

    public record BlockBeds(String block, long proposed, long capacity) {
    }

    public record StaffDashboard(StaffKpis kpis, List<Attention> attention, List<StatusCount> applicationsByStatus,
            long applicationsTotal, CheckInPlan checkInPlan, List<BlockBeds> bedsByBlock) {
    }

    // ---------------------------------------------------------------- Manager

    /**
     * Rates are fractions (0.85 = 85 %), rounded down so a rate below 1 never reads 100 %; {@code slaRate} is null when
     * nothing was resolved in the window. {@code allocated} = Beds held in the Term, {@code residents} = those living
     * in (door code released or checked in at the desk). Money as {@link #money}.
     */
    public record ManagerKpis(long allocated, long beds, long collected, BigDecimal collectionRate, BigDecimal slaRate,
            BigDecimal slaTarget, int slaHours, long refundsWaiting, long escalationsWaiting, long residents,
            long invoiced, long outstanding, long outstandingInvoices) {
    }

    /** The Staff work a Manager also decides on, so the Manager's home needs no Staff dashboard. */
    public record ManagerWork(long toReview, long submitted, long underReview, long paymentsToConfirm,
            Proposal proposal) {
    }

    public record FloorBeds(int floor, long allocated, long beds) {
    }

    public record ManagerDashboard(String block, ManagerKpis kpis, List<FloorBeds> floors, String floorNote,
            List<Attention> waiting, ManagerWork work, List<BlockBeds> bedsByBlock) {
    }

    public record ApprovalCounts(long assignment, long lateCheckIn, long swaps, long refunds) {
    }

    // ---------------------------------------------------------------- Admin

    public record TermInfo(String name, String statusLabel, LocalDate endsAt) {
    }

    public record NextTerm(String name, Instant registrationOpensAt) {
    }

    /** {@code residents} and {@code allocated} as the Manager's; money as {@link #money}. */
    public record AdminKpis(long residents, long beds, long collected, BigDecimal collectionRate, long activeUsers,
            long students, long staff, long managers, long allocated, long invoiced, long outstanding,
            long outstandingInvoices) {
    }

    /**
     * Who the funnel leaves out: Applications that ended without a Bed, and the continuing residents, who hold a Bed
     * of the Term without an Allocated Application of it (renewed from the previous Term).
     */
    public record FunnelOutside(long waitlisted, long rejected, long expired, long continuing) {
    }

    public record FunnelStep(String label, long value) {
    }

    public record BlockOccupancy(String block, String gender, long allocated, long beds) {
    }

    public record Check(boolean ok, String text, String link) {
    }

    /** @param tone success or warning */
    public record Integration(String name, String status, String tone) {
    }

    public record AdminDashboard(TermInfo term, NextTerm nextTerm, AdminKpis kpis, List<FunnelStep> funnel,
            String funnelNote, List<BlockOccupancy> blocks, List<Check> checks, List<Integration> integrations,
            FunnelOutside funnelOutside) {
    }

    /** SLA rate: requests resolved in this many days. */
    private static final int SLA_WINDOW_DAYS = 30;
    /** Admin "active users": signed in within this many days. */
    private static final int ACTIVE_DAYS = 30;
    /** How many refunds and escalations the Manager's list shows of each. */
    private static final int WAITING_ITEMS = 5;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy").withZone(TimeConfig.CAMPUS_ZONE);
    private static final List<String> PIPELINE = List.of("AWAITING_ROOMMATE", "AWAITING_DEPOSIT", "SUBMITTED",
            "UNDER_REVIEW", "APPROVED", "WAITLISTED", "ALLOCATED", "FORFEITED", "REJECTED", "CANCELLED", "EXPIRED");
    /** Invoices of the Blocks, and those without a Bed (Deposits) by gender, as on Collections and refunds. */
    private static final String INVOICES_IN_SCOPE = "(building_id IN (:b) OR (building_id IS NULL AND gender IN (:genders)))";
    /** Leavers still holding their Bed after the check-out date (no Allocation in a later Term). */
    private static final String LATE_CHECK_OUTS = """
            SELECT count(*) FROM rpt_v_allocation a JOIN rpt_v_term t ON t.id = a.term_id
            JOIN rpt_v_bed b ON b.bed_id = a.bed_id
            WHERE a.status = 'ACTIVE' AND t.check_out_by < :today AND b.building_id IN (:b)
              AND NOT EXISTS (SELECT 1 FROM rpt_v_allocation n JOIN rpt_v_term nt ON nt.id = n.term_id
                              WHERE n.student_id = a.student_id AND n.status = 'ACTIVE'
                                AND nt.stay_start > t.stay_start)
            """;
    /** Refunds to decide, as on the Manager's refund list: the Blocks', and those without a Bed by gender. */
    private static final String PENDING_REFUNDS = """
            SELECT count(*) FROM rpt_v_refund WHERE term_id = :term
              AND (building_id IN (:b) OR (building_id IS NULL AND gender IN (:genders))) AND status = 'PENDING'
            """;

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final ReportScope scope;
    private final TermCatalog terms;
    private final Parameters parameters;
    private final Environment environment;
    private final Clock clock;

    public DashboardService(JdbcClient jdbc, CurrentUser currentUser, ReportScope scope, TermCatalog terms,
            Parameters parameters, Environment environment, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.scope = scope;
        this.terms = terms;
        this.parameters = parameters;
        this.environment = environment;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- Staff

    @Transactional(readOnly = true)
    public StaffDashboard staff(Long termId, String block) {
        TermSummary term = scope.termOrNone(termId);
        ReportScope.Blocks blocks = scope.blocks(block);
        Map<String, Object> p = ReportScope.params(term, blocks);
        Map<String, Long> byStatus = applicationsByStatus(p);
        long submitted = byStatus.getOrDefault("SUBMITTED", 0L);
        long underReview = byStatus.getOrDefault("UNDER_REVIEW", 0L);
        long toConfirm = paymentsToConfirm(p);
        Proposal proposal = proposal(term, blocks);
        record Oos(String room, Instant since) {
        }
        List<Oos> outOfService = jdbc.sql("""
                SELECT DISTINCT room, oos_since FROM rpt_v_bed
                WHERE building_id IN (:b) AND room_status = 'OUT_OF_SERVICE' ORDER BY oos_since, room
                """).params(p).query((rs, i) -> new Oos(rs.getString("room"), rs.getTimestamp("oos_since").toInstant()))
                .list();
        long urgent = count("""
                SELECT count(*) FROM rpt_v_maintenance WHERE building_id IN (:b)
                  AND status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS') AND priority = 'HIGH'
                """, p);
        p.put("since", Timestamp.from(Instant.now(clock).minus(Duration.ofDays(7))));
        long expired = count("""
                SELECT count(*) FROM rpt_v_application
                WHERE term_id = :term AND gender IN (:genders) AND status = 'EXPIRED' AND deposit_due_at >= :since
                """, p);

        List<Attention> attention = new ArrayList<>();
        if (proposal != null && proposal.conflicts() > 0) {
            attention.add(new Attention("proposal", "proposal", "warning", plural(proposal.conflicts(), "conflict")
                    + " in the allocation proposal", "Resolve them before the Block goes to its Manager.",
                    "/staff/assignment/" + proposal.runId(), "Resolve",
                    Map.of("count", proposal.conflicts(), "runId", proposal.runId())));
        }
        // Only Managers confirm payment claims (ADR-19, ADR-22).
        if (toConfirm > 0 && Permission.CONFIRM_PAYMENTS.allows(currentUser.get().role())) {
            attention.add(new Attention("payments", "payments", "warning", plural(toConfirm, "transfer") + " to confirm",
                    "Students said they transferred and wait for a Manager to confirm.", "/manager/payment-claims",
                    "Confirm", Map.of("count", toConfirm)));
        }
        if (urgent > 0) {
            attention.add(new Attention("maintenance", "maintenance", "error",
                    plural(urgent, "urgent Maintenance Request") + " open", "High priority, not resolved yet.",
                    "/staff/maintenance", "Open", Map.of("count", urgent)));
        }
        if (submitted + underReview > 0) {
            attention.add(new Attention("queue", "queue", "info", plural(submitted + underReview, "Application")
                    + " to review", submitted + " Submitted · " + underReview + " Under Review", "/staff/applications",
                    "Review", Map.of("count", submitted + underReview, "submitted", submitted, "underReview", underReview)));
        }
        if (!outOfService.isEmpty()) {
            Oos first = outOfService.getFirst();
            attention.add(new Attention("room", "room", "info", plural(outOfService.size(), "Room") + " out of service",
                    "Oldest: " + first.room() + " since " + DAY.format(first.since()), "/staff/inventory", "View",
                    Map.of("count", outOfService.size(), "room", first.room(), "since", first.since())));
        }
        p.put("today", LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE)));
        long lateCheckOuts = count(LATE_CHECK_OUTS, p);
        if (lateCheckOuts > 0) {
            attention.add(new Attention("check-out", "check-out", "error", plural(lateCheckOuts, "leaver")
                    + " past the check-out date", "They have not checked out at the desk.", "/staff/check-out", "Open",
                    Map.of("count", lateCheckOuts)));
        }
        if (expired > 0) {
            attention.add(new Attention("expired", "expired", "neutral", plural(expired, "Deposit") + " expired this week",
                    "Their Applications were cancelled; the students may apply again.", "/staff/applications", "View",
                    Map.of("count", expired)));
        }

        List<StatusCount> statuses = PIPELINE.stream().filter(byStatus::containsKey)
                .map(s -> new StatusCount(ReportScope.APPLICATION_STATUSES.get(s), byStatus.get(s))).toList();
        return new StaffDashboard(
                new StaffKpis(submitted + underReview, submitted, underReview, toConfirm, proposal, outOfService.size(),
                        outOfService.isEmpty() ? null
                                : new OutOfService(outOfService.getFirst().room(), outOfService.getFirst().since())),
                attention, statuses, statuses.stream().mapToLong(StatusCount::count).sum(), checkInPlan(term, p),
                bedsByBlock(term, blocks, proposal));
    }

    /** Applications of the Term by status (no Drafts), for the genders of the Blocks. */
    private Map<String, Long> applicationsByStatus(Map<String, Object> p) {
        Map<String, Long> byStatus = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT status, count(*) AS n FROM rpt_v_application
                WHERE term_id = :term AND gender IN (:genders) AND status <> 'DRAFT' GROUP BY status
                """).params(p).query((rs, i) -> Map.entry(rs.getString("status"), rs.getLong("n"))).list()
                .forEach(e -> byStatus.put(e.getKey(), e.getValue()));
        return byStatus;
    }

    private long paymentsToConfirm(Map<String, Object> p) {
        return count("SELECT count(*) FROM rpt_v_invoice WHERE term_id = :term AND status = 'AWAITING_CONFIRMATION' AND "
                + INVOICES_IN_SCOPE, p);
    }

    /** The latest assignment run of the Term (not a dry run), counted over the Blocks. */
    private Proposal proposal(TermSummary term, ReportScope.Blocks blocks) {
        record Run(long id, String status, long input) {
        }
        Optional<Run> run = jdbc.sql("""
                SELECT id, status, input_count FROM rpt_v_assignment_run
                WHERE term_id = :term AND kind <> 'DRY_RUN' AND status NOT IN ('FAILED', 'DISCARDED')
                ORDER BY started_at DESC, id DESC LIMIT 1
                """).param("term", term.id())
                .query((rs, i) -> new Run(rs.getLong("id"), rs.getString("status"), rs.getLong("input_count"))).optional();
        if (run.isEmpty()) {
            return null;
        }
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("run", run.get().id());
        p.put("b", blocks.idList());
        long proposed = count("SELECT count(*) FROM rpt_v_proposal WHERE run_id = :run AND building_id IN (:b) AND bed_id IS NOT NULL", p);
        long conflicts = count("SELECT count(*) FROM rpt_v_proposal WHERE run_id = :run AND building_id IN (:b) AND open_conflict", p);
        long waitlisted = count("SELECT count(*) FROM rpt_v_proposal WHERE run_id = :run AND waitlisted", p);
        long committed = count("""
                SELECT count(*) FROM rpt_v_assignment_run_block WHERE run_id = :run AND building_id IN (:b)
                  AND status = 'COMMITTED'
                """, p);
        long total = count("SELECT count(*) FROM rpt_v_assignment_run_block WHERE run_id = :run AND building_id IN (:b)", p);
        return new Proposal("RUN-" + run.get().id(), proposed, run.get().input(), conflicts, waitlisted, committed, total);
    }

    /** Check-ins recorded on each day of the Term's check-in window, before and after noon. */
    private CheckInPlan checkInPlan(TermSummary term, Map<String, Object> p) {
        if (term.checkInStart() == null || term.checkInEnd() == null) {
            return null;
        }
        long allocated = count("""
                SELECT count(*) FROM rpt_v_allocation a JOIN rpt_v_bed b ON b.bed_id = a.bed_id
                WHERE a.term_id = :term AND a.status <> 'CANCELLED' AND b.building_id IN (:b)
                """, p);
        if (allocated == 0) {
            return null;
        }
        Map<LocalDate, long[]> days = new LinkedHashMap<>();
        for (LocalDate d = term.checkInStart(); !d.isAfter(term.checkInEnd()); d = d.plusDays(1)) {
            days.put(d, new long[2]);
        }
        jdbc.sql("""
                SELECT a.checked_in_at FROM rpt_v_allocation a JOIN rpt_v_bed b ON b.bed_id = a.bed_id
                WHERE a.term_id = :term AND b.building_id IN (:b) AND a.checked_in_at IS NOT NULL
                """).params(p).query((rs, i) -> rs.getTimestamp("checked_in_at").toInstant()).list().forEach(at -> {
                    var local = at.atZone(TimeConfig.CAMPUS_ZONE);
                    long[] slot = days.get(local.toLocalDate());
                    if (slot != null) {
                        slot[local.getHour() < 12 ? 0 : 1]++;
                    }
                });
        return new CheckInPlan(term.checkInStart(), term.checkInEnd(), days.entrySet().stream()
                .map(e -> new PlanDay(e.getKey(), e.getValue()[0], e.getValue()[1])).toList());
    }

    /** Beds allocated in the Term plus Beds the open proposal holds, against the Block's capacity. */
    private List<BlockBeds> bedsByBlock(TermSummary term, ReportScope.Blocks blocks, Proposal proposal) {
        Map<String, Object> p = ReportScope.params(term, blocks);
        Map<Long, Long> capacity = perBlock("SELECT building_id AS k, count(*) AS n FROM rpt_v_bed WHERE building_id IN (:b) AND "
                + ReportScope.inService(null) + " GROUP BY building_id", p);
        Map<Long, Long> allocated = perBlock("""
                SELECT b.building_id AS k, count(*) AS n FROM rpt_v_allocation a JOIN rpt_v_bed b ON b.bed_id = a.bed_id
                WHERE a.term_id = :term AND""" + scope.held(term, "a") + """
                AND b.building_id IN (:b) GROUP BY b.building_id
                """, p);
        Map<Long, Long> pending = new LinkedHashMap<>();
        if (proposal != null) {
            p.put("run", Long.parseLong(proposal.runId().substring(4)));
            pending = perBlock("""
                    SELECT x.building_id AS k, count(*) AS n FROM rpt_v_proposal x
                    JOIN rpt_v_assignment_run r ON r.id = x.run_id
                    LEFT JOIN rpt_v_assignment_run_block rb ON rb.run_id = x.run_id AND rb.building_id = x.building_id
                    WHERE x.run_id = :run AND x.building_id IN (:b) AND x.bed_id IS NOT NULL
                      AND r.status IN ('PROPOSED', 'IN_REVIEW') AND coalesce(rb.status, 'REVIEW') <> 'COMMITTED'
                    GROUP BY x.building_id
                    """, p);
        }
        Map<Long, Long> open = pending;
        return blocks.codes().entrySet().stream().map(e -> new BlockBeds(e.getValue(),
                allocated.getOrDefault(e.getKey(), 0L) + open.getOrDefault(e.getKey(), 0L),
                capacity.getOrDefault(e.getKey(), 0L))).toList();
    }

    // ---------------------------------------------------------------- Manager

    @Transactional(readOnly = true)
    public ManagerDashboard manager(Long termId, String block) {
        currentUser.require(Role.MANAGER, Role.ADMIN);
        TermSummary term = scope.termOrNone(termId);
        ReportScope.Blocks blocks = scope.blocks(block);
        Map<String, Object> p = ReportScope.params(term, blocks);
        long beds = count("SELECT count(*) FROM rpt_v_bed WHERE building_id IN (:b) AND " + ReportScope.inService(null), p);
        long allocated = count("""
                SELECT count(*) FROM rpt_v_allocation a JOIN rpt_v_bed b ON b.bed_id = a.bed_id
                WHERE a.term_id = :term AND""" + scope.held(term, "a") + """
                AND b.building_id IN (:b)
                """, p);
        long residents = count("""
                SELECT count(*) FROM rpt_v_allocation a JOIN rpt_v_bed b ON b.bed_id = a.bed_id
                WHERE a.term_id = :term AND""" + scope.held(term, "a") + """
                AND a.resident_at IS NOT NULL AND b.building_id IN (:b)
                """, p);
        long[] money = money(p, INVOICES_IN_SCOPE);
        int slaHours = jdbc.sql("SELECT normal_hours FROM rpt_v_sla_policy WHERE building_id IN (:b) ORDER BY normal_hours")
                .params(p).query(Integer.class).list().stream().findFirst()
                .orElseGet(() -> parameters.intValue("sla.normal_max_hours"));
        p.put("since", Timestamp.from(Instant.now(clock).minus(Duration.ofDays(SLA_WINDOW_DAYS))));
        p.put("hours", slaHours);
        long resolved = count("""
                SELECT count(*) FROM rpt_v_maintenance WHERE building_id IN (:b) AND resolved_at >= :since
                """, p);
        long onTime = count("""
                SELECT count(*) FROM rpt_v_maintenance WHERE building_id IN (:b) AND resolved_at >= :since
                  AND resolved_at <= reported_at + make_interval(hours => :hours)
                """, p);
        long refunds = count(PENDING_REFUNDS, p);
        long escalations = count("SELECT count(*) FROM rpt_v_escalation WHERE building_id IN (:b) AND status = 'OPEN'", p);

        List<FloorBeds> floors = jdbc.sql("""
                SELECT b.floor, count(DISTINCT b.bed_id) FILTER (WHERE """ + ReportScope.inService("b") + """
                ) AS beds, count(DISTINCT a.bed_id) AS allocated
                FROM rpt_v_bed b
                LEFT JOIN rpt_v_allocation a ON a.bed_id = b.bed_id AND a.term_id = :term AND""" + scope.held(term, "a") + """
                WHERE b.building_id IN (:b) GROUP BY b.floor ORDER BY b.floor
                """).params(p)
                .query((rs, i) -> new FloorBeds(rs.getInt("floor"), rs.getLong("allocated"), rs.getLong("beds"))).list();
        long outOfService = count("""
                SELECT count(DISTINCT room_id) FROM rpt_v_bed WHERE building_id IN (:b) AND room_status = 'OUT_OF_SERVICE'
                """, p);

        List<Attention> waiting = new ArrayList<>();
        p.put("limit", WAITING_ITEMS);
        jdbc.sql("""
                SELECT id, amount, source_type FROM rpt_v_refund
                WHERE term_id = :term AND (building_id IN (:b) OR (building_id IS NULL AND gender IN (:genders)))
                  AND status = 'PENDING' ORDER BY id LIMIT :limit
                """).params(p).query((rs, i) -> new Attention("refund-" + rs.getLong("id"), "refund", "warning",
                        "Refund of " + vnd(rs.getLong("amount")), refundSource(rs.getString("source_type")),
                        "/manager/finance", "Decide",
                        Map.of("amount", rs.getLong("amount"), "source", rs.getString("source_type"))))
                .list().forEach(waiting::add);
        jdbc.sql("""
                SELECT source_code, title, why, tone FROM rpt_v_escalation
                WHERE building_id IN (:b) AND status = 'OPEN' ORDER BY (tone = 'DANGER') DESC, opened_at LIMIT :limit
                """).params(p).query((rs, i) -> new Attention(rs.getString("source_code"), "escalation",
                        rs.getString("tone").equals("DANGER") ? "error" : "warning", rs.getString("title"),
                        rs.getString("why"), "/manager/escalations", "Handle",
                        Map.of("code", rs.getString("source_code")))).list().forEach(waiting::add);
        p.put("today", LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE)));
        long lateCheckOuts = count(LATE_CHECK_OUTS, p);
        if (lateCheckOuts > 0) {
            waiting.add(new Attention("check-out", "check-out", "error", plural(lateCheckOuts, "leaver")
                    + " past the check-out date", "Staff list them at the check-out desk; their Beds stay held.",
                    "/manager/next-term/turnover", "View", Map.of("count", lateCheckOuts)));
        }
        for (Map.Entry<Long, String> b : blocks.codes().entrySet()) {
            for (String[] type : new String[][] { { "MAINTENANCE", "Maintenance Requests" },
                    { "ROOM_CHANGE", "Room-Change Requests" } }) {
                long rules = count("""
                        SELECT count(*) FROM rpt_v_routing_rule WHERE building_id = :one AND request_type = :type
                          AND scope = 'ALL' AND active
                        """, Map.of("one", b.getKey(), "type", type[0]));
                if (rules == 0) {
                    waiting.add(new Attention("routing-" + b.getValue() + "-" + type[0].toLowerCase(Locale.ROOT), "routing",
                            "info", "No routing rule for " + type[1] + " in Block " + b.getValue(),
                            "New requests wait unassigned until Staff pick them up.", "/manager/routing-rules", "Add rule",
                            Map.of("block", b.getValue(), "requestType", type[0])));
                }
            }
        }
        Map<String, Long> byStatus = applicationsByStatus(p);
        long submitted = byStatus.getOrDefault("SUBMITTED", 0L);
        long underReview = byStatus.getOrDefault("UNDER_REVIEW", 0L);
        Proposal proposal = proposal(term, blocks);
        return new ManagerDashboard(blocks.single() ? blocks.codes().values().stream().findFirst().orElse(null) : null,
                new ManagerKpis(allocated, beds, money[1], rate(money[1], money[0]),
                        resolved == 0 ? null : rate(onTime, resolved),
                        BigDecimal.valueOf(parameters.intValue("maintenance.sla_target_percent")).movePointLeft(2),
                        slaHours, refunds, escalations, residents, money[0], money[2], money[3]),
                floors, outOfService == 0 ? null : plural(outOfService, "Room") + " out of service "
                        + (outOfService == 1 ? "is" : "are") + " not counted.",
                waiting, new ManagerWork(submitted + underReview, submitted, underReview, paymentsToConfirm(p), proposal),
                bedsByBlock(term, blocks, proposal));
    }

    @Transactional(readOnly = true)
    public ApprovalCounts approvals(Long termId, String block) {
        currentUser.require(Permission.APPROVE_ASSIGNMENT);
        TermSummary term = scope.termOrNone(termId);
        Map<String, Object> p = ReportScope.params(term, scope.blocks(block));
        return new ApprovalCounts(
                count("""
                        SELECT count(*) FROM rpt_v_assignment_run_block rb JOIN rpt_v_assignment_run r ON r.id = rb.run_id
                        WHERE r.term_id = :term AND rb.building_id IN (:b) AND rb.status = 'SUBMITTED'
                        """, p),
                count("""
                        SELECT count(*) FROM rpt_v_late_check_in l JOIN rpt_v_allocation a ON a.id = l.allocation_id
                        JOIN rpt_v_bed b ON b.bed_id = a.bed_id
                        WHERE a.term_id = :term AND b.building_id IN (:b) AND l.status = 'PENDING'
                        """, p),
                count("""
                        SELECT count(*) FROM rpt_v_swap WHERE term_id = :term AND status = 'TO_MANAGER'
                          AND (a_building_id IN (:b) OR b_building_id IN (:b))
                        """, p),
                count(PENDING_REFUNDS, p));
    }

    // ---------------------------------------------------------------- Admin

    @Transactional(readOnly = true)
    public AdminDashboard admin(Long termId) {
        currentUser.require(Role.ADMIN);
        TermSummary term = scope.termOrNone(termId);
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("term", term.id());
        p.put("since", Timestamp.from(Instant.now(clock).minus(Duration.ofDays(ACTIVE_DAYS))));
        // Residence = door code released or checked in at the desk (ADR-23), as everywhere since phase 5.
        long allocated = count("SELECT count(*) FROM rpt_v_allocation a WHERE a.term_id = :term AND"
                + scope.held(term, "a"), p);
        long residents = count("""
                SELECT count(*) FROM rpt_v_allocation a WHERE a.term_id = :term AND""" + scope.held(term, "a") + """
                AND a.resident_at IS NOT NULL
                """, p);
        // The funnel follows the Term's Applications; continuing residents hold a Bed without one.
        String fromApplication = """
                EXISTS (SELECT 1 FROM rpt_v_application ap
                        WHERE ap.term_id = a.term_id AND ap.student_id = a.student_id AND ap.status = 'ALLOCATED')
                """;
        long applicantResidents = count("SELECT count(*) FROM rpt_v_allocation a WHERE a.term_id = :term AND"
                + scope.held(term, "a") + "AND a.resident_at IS NOT NULL AND " + fromApplication, p);
        long continuing = count("SELECT count(*) FROM rpt_v_allocation a WHERE a.term_id = :term AND"
                + scope.held(term, "a") + "AND NOT " + fromApplication, p);
        long beds = count("SELECT count(*) FROM rpt_v_bed WHERE " + ReportScope.inService(null), p);
        long[] money = money(p, "TRUE");
        record Users(long active, long students, long staff, long managers) {
        }
        Users users = jdbc.sql("""
                SELECT count(*) FILTER (WHERE last_sign_in_at >= :since) AS active,
                       count(*) FILTER (WHERE role = 'STUDENT') AS students,
                       count(*) FILTER (WHERE role = 'STAFF') AS staff,
                       count(*) FILTER (WHERE role = 'MANAGER') AS managers
                FROM rpt_v_user WHERE status = 'ACTIVE'
                """).params(p).query((rs, i) -> new Users(rs.getLong("active"), rs.getLong("students"),
                        rs.getLong("staff"), rs.getLong("managers"))).single();

        Map<String, Long> apps = new LinkedHashMap<>();
        jdbc.sql("SELECT status, count(*) AS n FROM rpt_v_application WHERE term_id = :term GROUP BY status").params(p)
                .query((rs, i) -> Map.entry(rs.getString("status"), rs.getLong("n"))).list()
                .forEach(e -> apps.put(e.getKey(), e.getValue()));
        long applied = apps.entrySet().stream().filter(e -> !e.getKey().equals("DRAFT")).mapToLong(Map.Entry::getValue).sum();
        long paid = count("SELECT count(*) FROM rpt_v_application WHERE term_id = :term AND submitted_at IS NOT NULL", p);
        long allocatedApps = apps.getOrDefault("ALLOCATED", 0L);
        long approved = apps.getOrDefault("APPROVED", 0L) + allocatedApps;
        List<FunnelStep> funnel = applied == 0 ? List.of() : List.of(new FunnelStep("Applied", applied),
                new FunnelStep("Deposit paid", paid), new FunnelStep("Approved", approved),
                new FunnelStep("Allocated", allocatedApps), new FunnelStep("Checked in", applicantResidents));
        FunnelOutside outside = new FunnelOutside(apps.getOrDefault("WAITLISTED", 0L),
                apps.getOrDefault("REJECTED", 0L), apps.getOrDefault("EXPIRED", 0L), continuing);
        String funnelNote = applied == 0 ? null : outside.waitlisted() + " waitlisted · " + outside.rejected()
                + " rejected · " + outside.expired() + " Deposits expired · " + continuing
                + " continuing residents hold Beds without an Application";

        List<BlockOccupancy> blocks = jdbc.sql("""
                SELECT b.block, b.gender, count(DISTINCT b.bed_id) FILTER (WHERE """ + ReportScope.inService("b") + """
                ) AS beds, count(DISTINCT a.bed_id) AS allocated
                FROM rpt_v_bed b
                LEFT JOIN rpt_v_allocation a ON a.bed_id = b.bed_id AND a.term_id = :term AND""" + scope.held(term, "a") + """
                WHERE b.block_status = 'ACTIVE' GROUP BY b.block, b.gender ORDER BY b.block
                """).params(p).query((rs, i) -> new BlockOccupancy(rs.getString("block"),
                        rs.getString("gender").equals("M") ? "Male" : "Female", rs.getLong("allocated"), rs.getLong("beds")))
                .list();

        Optional<TermSummary> next = terms.publishedTerms().stream()
                .filter(t -> t.stayStart() != null && term.stayEnd() != null && t.stayStart().isAfter(term.stayEnd()))
                .min(Comparator.comparing(TermSummary::stayStart));
        return new AdminDashboard(ReportScope.none(term) ? null : new TermInfo(term.name(), statusLabel(term), term.stayEnd()),
                next.map(t -> new NextTerm(t.name(), t.registrationOpensAt())).orElse(null),
                new AdminKpis(residents, beds, money[1], rate(money[1], money[0]), users.active(), users.students(),
                        users.staff(), users.managers(), allocated, money[0], money[2], money[3]),
                funnel, funnelNote, blocks, checks(next), integrations(), outside);
    }

    /** What the Admin should have ready for the next Term. */
    private List<Check> checks(Optional<TermSummary> next) {
        List<Check> checks = new ArrayList<>();
        checks.add(next.isPresent() ? new Check(true, next.get().name() + " is published", "/admin/terms")
                : new Check(false, "Publish the next Term", "/admin/terms"));
        boolean confirmed = jdbc.sql("SELECT policy_confirmed FROM rpt_v_fee_policy").query(Boolean.class).optional()
                .orElse(false);
        checks.add(new Check(confirmed, confirmed ? "Fees and refund rules are confirmed" : "Confirm the fees and refund rules",
                "/admin/fees"));
        // Managers work for every Block (ADR-19); Staff are linked to the Blocks they work in.
        boolean manager = count("SELECT count(*) FROM rpt_v_user WHERE role = 'MANAGER' AND status = 'ACTIVE'",
                Map.of()) > 0;
        List<String> noStaff = jdbc.sql("""
                SELECT DISTINCT b.block FROM rpt_v_bed b
                WHERE b.block_status = 'ACTIVE' AND NOT EXISTS (
                    SELECT 1 FROM rpt_v_user_block ub JOIN rpt_v_user u ON u.id = ub.user_id
                    WHERE ub.building_id = b.building_id AND u.role = 'STAFF' AND u.status = 'ACTIVE')
                ORDER BY b.block
                """).query(String.class).list();
        checks.add(!manager ? new Check(false, "Add an active Manager account", "/admin/users")
                : noStaff.isEmpty() ? new Check(true, "A Manager is active and every Block has Staff", "/admin/users")
                : new Check(false, "Assign Staff to Block " + String.join(", ", noStaff), "/admin/users"));
        boolean checklist = count("SELECT count(*) FROM rpt_v_checklist WHERE status = 'PUBLISHED'", Map.of()) > 0;
        checks.add(new Check(checklist, checklist ? "An inspection checklist is published"
                : "Publish an inspection checklist", "/admin/inspection-checklists"));
        return checks;
    }

    /** Operations settings (environment), never their values. */
    private List<Integration> integrations() {
        List<Integration> list = new ArrayList<>();
        list.add(integration("Google sign-in", "campusstay.auth.google.client-id"));
        list.add(integration("Receiving bank account", "campusstay.payment.account-number"));
        list.add(integration("Push notifications (FCM)", "campusstay.push.fcm-credentials-file"));
        list.add(integration("Email", "spring.mail.host"));
        return list;
    }

    private Integration integration(String name, String property) {
        String value = environment.getProperty(property);
        boolean set = value != null && !value.isBlank();
        return new Integration(name, set ? "Connected" : "Not set", set ? "success" : "warning");
    }

    private String statusLabel(TermSummary term) {
        Instant now = Instant.now(clock);
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        if (term.registrationOpensAt() != null && now.isBefore(term.registrationOpensAt())) {
            return "upcoming";
        }
        if (term.registrationClosesAt() != null && now.isBefore(term.registrationClosesAt())) {
            return "registration open";
        }
        if (term.stayStart() != null && today.isBefore(term.stayStart())) {
            return "starts " + term.stayStart().format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));
        }
        if (term.stayEnd() != null && today.isAfter(term.stayEnd())) {
            return "ended";
        }
        return "in progress";
    }

    // ---------------------------------------------------------------- helpers

    /**
     * {@code [invoiced, collected, outstanding, outstanding Invoices]} of the Term over every kind of Invoice
     * (Deposit, Balance with its Utility Deposit, next-Term fee, Utility, charges): the same figures as
     * {@code GET /finance/summary} and {@code GET /reports/financial} for the same Term and Blocks. Invoiced = not
     * Void; collected = Paid and Refunded (the money came in; refunds are reported apart); outstanding = Unpaid,
     * Overdue and Awaiting confirmation.
     */
    private long[] money(Map<String, Object> p, String where) {
        return jdbc.sql("SELECT coalesce(sum(amount) FILTER (WHERE status <> 'VOID'), 0) AS invoiced,"
                + " coalesce(sum(amount) FILTER (WHERE status IN ('PAID', 'REFUNDED')), 0) AS collected,"
                + " coalesce(sum(amount) FILTER (WHERE status IN ('UNPAID', 'OVERDUE', 'AWAITING_CONFIRMATION')), 0)"
                + " AS outstanding,"
                + " count(*) FILTER (WHERE status IN ('UNPAID', 'OVERDUE', 'AWAITING_CONFIRMATION')) AS open"
                + " FROM rpt_v_invoice WHERE term_id = :term AND " + where).params(p)
                .query((rs, i) -> new long[] { rs.getLong("invoiced"), rs.getLong("collected"),
                        rs.getLong("outstanding"), rs.getLong("open") }).single();
    }

    private long count(String sql, Map<String, ?> params) {
        return jdbc.sql(sql).params(params).query(Long.class).single();
    }

    private Map<Long, Long> perBlock(String sql, Map<String, Object> p) {
        Map<Long, Long> result = new LinkedHashMap<>();
        jdbc.sql(sql).params(p).query((rs, i) -> Map.entry(rs.getLong("k"), rs.getLong("n"))).list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    /** Rounded down: 99.996 % is 0.9999, never 1, while something is missing. */
    static BigDecimal rate(long part, long whole) {
        return whole == 0 ? null : BigDecimal.valueOf(part).divide(BigDecimal.valueOf(whole), 4, RoundingMode.DOWN);
    }

    static String vnd(long amount) {
        return NumberFormat.getIntegerInstance(Locale.US).format(amount) + " VND";
    }

    private static String plural(long n, String noun) {
        return n + " " + noun + (n == 1 ? "" : "s");
    }

    private static String refundSource(String source) {
        return switch (source) {
            case "CHECK_OUT" -> "Check-out: Utility Deposit settlement";
            case "ROOM_CHANGE" -> "Room change or swap";
            case "APPLICATION_CANCEL" -> "Application cancelled";
            default -> "Other";
        };
    }
}
