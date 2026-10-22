package vn.fpt.campusstay.service.report;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.common.export.ReportExport;
import vn.fpt.campusstay.config.TimeConfig;

/**
 * Reports: occupancy and finances of a Term (Admin, Block Managers in their Blocks)
 * and the Block report with its exports. Read from the reporting views.
 */
@Service
public class ReportService {

    // ---------------------------------------------------------------- occupancy

    public record Cell(long allocated, long capacity) {
    }

    public record TypeRow(String roomTypeName, List<Cell> cells) {
    }

    public record BlockRows(String block, List<TypeRow> rows) {
    }

    public record OccupancySummary(long capacity, long rooms, long blocks, long allocated, long checkedIn,
            long notArrived, long waitlisted, String waitlistNote) {
    }

    public record Occupancy(Instant asOf, List<String> roomClasses, String note, OccupancySummary summary,
            List<BlockRows> blocks) {
    }

    // ---------------------------------------------------------------- finances

    public record MoneyRow(String block, long invoiced, long collected, long outstanding, long refunded) {
    }

    public record MoneySummary(long invoiced, long collected, long outstanding, long refunded, long outstandingInvoices,
            long overdueInvoices, long refundCount) {
    }

    public record Financial(Instant asOf, List<String> blocks, List<MoneyRow> rows, MoneySummary summary) {
    }

    // ---------------------------------------------------------------- Block report

    public record Week(String label, long value) {
    }

    public record BlockReport(long allocated, List<Week> weekly, long notCheckedIn, LocalDate followUpBy) {
    }

    private static final DateTimeFormatter DAY_MONTH = DateTimeFormatter.ofPattern("dd/MM");
    /** Invoices of students without a Bed have no Block; they are counted in a row of their own. */
    static final String NO_BLOCK = "Not allocated";

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final ReportScope scope;
    private final Catalog catalog;
    private final Clock clock;

    public ReportService(JdbcClient jdbc, CurrentUser currentUser, ReportScope scope, Catalog catalog, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.scope = scope;
        this.catalog = catalog;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- occupancy

    @Transactional(readOnly = true)
    public Occupancy occupancy(Long termId, String block) {
        currentUser.require(Permission.VIEW_REPORTS);
        TermSummary term = scope.term(termId);
        ReportScope.Blocks blocks = scope.blocks(block);
        Map<String, Object> p = ReportScope.params(term, blocks);
        record Slot(long buildingId, long typeId, long classId, long capacity, long allocated, long checkedIn) {
        }
        // A Bed of a past Term may have been held twice (a student left early, another one moved in): count Beds once.
        List<Slot> slots = jdbc.sql("""
                SELECT b.building_id, b.room_type_id, b.room_class_id, count(DISTINCT b.bed_id) AS capacity,
                       count(DISTINCT a.bed_id) AS allocated,
                       count(DISTINCT a.bed_id) FILTER (WHERE a.checked_in_at IS NOT NULL) AS checked_in
                FROM rpt_v_bed b
                LEFT JOIN rpt_v_allocation a ON a.bed_id = b.bed_id AND a.term_id = :term AND""" + scope.held(term, "a") + """
                WHERE b.building_id IN (:b) AND """ + ReportScope.inService("b")
                + " GROUP BY b.building_id, b.room_type_id, b.room_class_id").params(p).query((rs, i) -> new Slot(rs.getLong("building_id"), rs.getLong("room_type_id"),
                        rs.getLong("room_class_id"), rs.getLong("capacity"), rs.getLong("allocated"),
                        rs.getLong("checked_in"))).list();
        List<Catalog.RoomClassInfo> classes = catalog.roomClasses().stream()
                .filter(c -> slots.stream().anyMatch(s -> s.classId() == c.id())).toList();
        List<Catalog.RoomTypeInfo> types = catalog.roomTypes().stream()
                .filter(t -> slots.stream().anyMatch(s -> s.typeId() == t.id())).toList();
        List<BlockRows> rows = new ArrayList<>();
        blocks.codes().forEach((id, code) -> {
            List<TypeRow> typeRows = types.stream()
                    .filter(t -> slots.stream().anyMatch(s -> s.buildingId() == id && s.typeId() == t.id()))
                    .map(t -> new TypeRow(t.name(), classes.stream().map(c -> slots.stream()
                            .filter(s -> s.buildingId() == id && s.typeId() == t.id() && s.classId() == c.id())
                            .findFirst().map(s -> new Cell(s.allocated(), s.capacity())).orElse(new Cell(0, 0)))
                            .toList()))
                    .toList();
            if (!typeRows.isEmpty()) {
                rows.add(new BlockRows(code, typeRows));
            }
        });
        long capacity = slots.stream().mapToLong(Slot::capacity).sum();
        long allocated = slots.stream().mapToLong(Slot::allocated).sum();
        long checkedIn = slots.stream().mapToLong(Slot::checkedIn).sum();
        long rooms = count("SELECT count(DISTINCT room_id) FROM rpt_v_bed b WHERE building_id IN (:b) AND "
                + ReportScope.inService("b"), p);
        long outOfService = count("""
                SELECT count(DISTINCT room_id) FROM rpt_v_bed WHERE building_id IN (:b) AND room_status = 'OUT_OF_SERVICE'
                """, p);
        long waitlisted = count("""
                SELECT count(*) FROM rpt_v_application WHERE term_id = :term AND gender IN (:genders) AND status = 'WAITLISTED'
                """, p);
        return new Occupancy(Instant.now(clock), classes.stream().map(Catalog.RoomClassInfo::name).toList(),
                outOfService == 0 ? null : outOfService + (outOfService == 1 ? " Room is" : " Rooms are")
                        + " out of service and not counted.",
                new OccupancySummary(capacity, rooms, rows.size(), allocated, checkedIn, allocated - checkedIn, waitlisted,
                        waitlisted == 0 ? null : "Round-2 offers go out when a Block is approved."),
                rows);
    }

    // ---------------------------------------------------------------- finances

    /**
     * Invoiced (not Void), collected (Paid and Refunded), outstanding (Unpaid, Overdue, Awaiting confirmation) and
     * refunded (approved or paid refunds) per Block; Invoices and refunds of students without a Bed are a row of
     * their own.
     */
    @Transactional(readOnly = true)
    public Financial financial(Long termId, String block) {
        currentUser.require(Permission.VIEW_REPORTS);
        TermSummary term = scope.term(termId);
        ReportScope.Blocks blocks = scope.blocks(block);
        Map<String, Object> p = ReportScope.params(term, blocks);
        record Money(Long buildingId, long invoiced, long collected, long outstanding, long open, long overdue) {
        }
        List<Money> money = jdbc.sql("""
                SELECT building_id,
                       coalesce(sum(amount) FILTER (WHERE status <> 'VOID'), 0) AS invoiced,
                       coalesce(sum(amount) FILTER (WHERE status IN ('PAID', 'REFUNDED')), 0) AS collected,
                       coalesce(sum(amount) FILTER (WHERE status IN ('UNPAID', 'OVERDUE', 'AWAITING_CONFIRMATION')), 0)
                           AS outstanding,
                       count(*) FILTER (WHERE status IN ('UNPAID', 'OVERDUE', 'AWAITING_CONFIRMATION')) AS open,
                       count(*) FILTER (WHERE status = 'OVERDUE') AS overdue
                FROM rpt_v_invoice
                WHERE term_id = :term AND (building_id IN (:b) OR (building_id IS NULL AND gender IN (:genders)))
                GROUP BY building_id
                """).params(p).query((rs, i) -> new Money(rs.getObject("building_id", Long.class), rs.getLong("invoiced"),
                        rs.getLong("collected"), rs.getLong("outstanding"), rs.getLong("open"), rs.getLong("overdue")))
                .list();
        record Refunds(Long buildingId, long amount, long count) {
        }
        List<Refunds> refunds = jdbc.sql("""
                SELECT building_id, coalesce(sum(amount), 0) AS amount, count(*) AS n FROM rpt_v_refund
                WHERE term_id = :term AND (building_id IN (:b) OR (building_id IS NULL AND gender IN (:genders)))
                  AND status IN ('APPROVED', 'PAID')
                GROUP BY building_id
                """).params(p).query((rs, i) -> new Refunds(rs.getObject("building_id", Long.class), rs.getLong("amount"),
                        rs.getLong("n"))).list();
        List<MoneyRow> rows = new ArrayList<>();
        blocks.codes().forEach((id, code) -> {
            Money m = money.stream().filter(x -> id.equals(x.buildingId())).findFirst().orElse(null);
            Refunds r = refunds.stream().filter(x -> id.equals(x.buildingId())).findFirst().orElse(null);
            rows.add(new MoneyRow(code, m == null ? 0 : m.invoiced(), m == null ? 0 : m.collected(),
                    m == null ? 0 : m.outstanding(), r == null ? 0 : r.amount()));
        });
        Money noBlock = money.stream().filter(m -> m.buildingId() == null).findFirst().orElse(null);
        Refunds noBlockRefunds = refunds.stream().filter(r -> r.buildingId() == null).findFirst().orElse(null);
        if (noBlock != null || noBlockRefunds != null) {
            rows.add(new MoneyRow(NO_BLOCK, noBlock == null ? 0 : noBlock.invoiced(), noBlock == null ? 0 : noBlock.collected(),
                    noBlock == null ? 0 : noBlock.outstanding(), noBlockRefunds == null ? 0 : noBlockRefunds.amount()));
        }
        return new Financial(Instant.now(clock), List.copyOf(blocks.codes().values()), rows,
                new MoneySummary(rows.stream().mapToLong(MoneyRow::invoiced).sum(),
                        rows.stream().mapToLong(MoneyRow::collected).sum(),
                        rows.stream().mapToLong(MoneyRow::outstanding).sum(),
                        rows.stream().mapToLong(MoneyRow::refunded).sum(), money.stream().mapToLong(Money::open).sum(),
                        money.stream().mapToLong(Money::overdue).sum(), refunds.stream().mapToLong(Refunds::count).sum()));
    }

    // ---------------------------------------------------------------- Block report

    /**
     * Check-ins per week from the start of the check-in window; students allocated but not checked in, to be
     * contacted before the window closes.
     */
    @Transactional(readOnly = true)
    public BlockReport block(Long termId, String block) {
        currentUser.require(Permission.VIEW_REPORTS);
        TermSummary term = scope.term(termId);
        Map<String, Object> p = ReportScope.params(term, scope.blocks(block));
        long allocated = count("""
                SELECT count(*) FROM rpt_v_allocation a JOIN rpt_v_bed b ON b.bed_id = a.bed_id
                WHERE a.term_id = :term AND""" + scope.held(term, "a") + """
                AND b.building_id IN (:b)
                """, p);
        List<LocalDate> checkIns = jdbc.sql("""
                SELECT a.checked_in_at FROM rpt_v_allocation a JOIN rpt_v_bed b ON b.bed_id = a.bed_id
                WHERE a.term_id = :term AND a.status <> 'CANCELLED' AND b.building_id IN (:b) AND a.checked_in_at IS NOT NULL
                """).params(p).query((rs, i) -> LocalDate.ofInstant(rs.getTimestamp("checked_in_at").toInstant(),
                        TimeConfig.CAMPUS_ZONE)).list();
        long notCheckedIn = count("""
                SELECT count(*) FROM rpt_v_allocation a JOIN rpt_v_bed b ON b.bed_id = a.bed_id
                WHERE a.term_id = :term AND""" + scope.held(term, "a") + """
                AND b.building_id IN (:b) AND a.checked_in_at IS NULL
                """, p);
        List<Week> weekly = new ArrayList<>();
        LocalDate start = term.checkInStart() != null ? term.checkInStart()
                : checkIns.stream().min(LocalDate::compareTo).orElse(null);
        if (start != null && !checkIns.isEmpty()) {
            LocalDate last = checkIns.stream().max(LocalDate::compareTo).orElse(start);
            LocalDate end = term.checkInEnd() != null && term.checkInEnd().isAfter(last) ? term.checkInEnd() : last;
            for (LocalDate week = start; !week.isAfter(end); week = week.plusWeeks(1)) {
                LocalDate from = week;
                LocalDate to = week.plusWeeks(1);
                weekly.add(new Week(DAY_MONTH.format(from), checkIns.stream()
                        .filter(d -> !d.isBefore(from) && d.isBefore(to)).count()));
            }
        }
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        LocalDate followUp = notCheckedIn > 0 && term.checkInEnd() != null && !term.checkInEnd().isBefore(today)
                ? term.checkInEnd() : null;
        return new BlockReport(allocated, weekly, notCheckedIn, followUp);
    }

    // ---------------------------------------------------------------- exports

    ReportExport.Table occupancyTable(Long termId, String block) {
        Occupancy o = occupancy(termId, block);
        List<String> header = new ArrayList<>(List.of("Block", "Room Type"));
        o.roomClasses().forEach(c -> {
            header.add(c + " allocated");
            header.add(c + " capacity");
        });
        List<List<Object>> rows = new ArrayList<>();
        for (BlockRows b : o.blocks()) {
            for (TypeRow r : b.rows()) {
                List<Object> row = new ArrayList<>(List.of(b.block(), r.roomTypeName()));
                r.cells().forEach(c -> {
                    row.add(c.allocated());
                    row.add(c.capacity());
                });
                rows.add(row);
            }
        }
        return new ReportExport.Table("occupancy", header, rows);
    }

    ReportExport.Table financialTable(Long termId, String block) {
        Financial f = financial(termId, block);
        List<List<Object>> rows = new ArrayList<>(f.rows().stream().map(r -> Arrays.<Object>asList(r.block(),
                r.invoiced(), r.collected(), r.outstanding(), r.refunded())).toList());
        MoneySummary s = f.summary();
        rows.add(Arrays.asList("Total", s.invoiced(), s.collected(), s.outstanding(), s.refunded()));
        return new ReportExport.Table("financial", List.of("Block", "Invoiced (VND)", "Collected (VND)",
                "Outstanding (VND)", "Refunded (VND)"), rows);
    }

    /** Rooms of the Block(s) with their allocated Beds. */
    ReportExport.Table blockOccupancy(Long termId, String block) {
        currentUser.require(Permission.VIEW_REPORTS);
        TermSummary term = scope.term(termId);
        Map<String, Object> p = ReportScope.params(term, scope.blocks(block));
        Map<Long, String> types = typeNames();
        Map<Long, String> classes = classNames();
        List<List<Object>> rows = jdbc.sql("""
                SELECT b.block, b.floor, b.room, b.room_type_id, b.room_class_id, b.room_status,
                       count(DISTINCT b.bed_id) AS beds, count(DISTINCT a.bed_id) AS allocated,
                       count(DISTINCT a.bed_id) FILTER (WHERE a.checked_in_at IS NOT NULL) AS checked_in
                FROM rpt_v_bed b
                LEFT JOIN rpt_v_allocation a ON a.bed_id = b.bed_id AND a.term_id = :term AND""" + scope.held(term, "a") + """
                WHERE b.building_id IN (:b) AND b.bed_status <> 'RETIRED' AND b.room_status <> 'RETIRED'
                GROUP BY b.block, b.floor, b.room, b.room_type_id, b.room_class_id, b.room_status
                ORDER BY b.block, b.room
                """).params(p).query((rs, i) -> Arrays.<Object>asList(rs.getString("block"), rs.getInt("floor"),
                        rs.getString("room"), types.get(rs.getLong("room_type_id")), classes.get(rs.getLong("room_class_id")),
                        rs.getString("room_status").equals("OUT_OF_SERVICE") ? "Out of service" : "In service",
                        rs.getLong("beds"), rs.getLong("allocated"), rs.getLong("checked_in"))).list();
        return new ReportExport.Table(fileName("block-occupancy", block), List.of("Block", "Floor", "Room", "Room Type",
                "Room Class", "Room status", "Beds", "Allocated", "Checked in"), rows);
    }

    /** Invoices of the Block(s) in the Term. */
    ReportExport.Table blockCollections(Long termId, String block) {
        currentUser.require(Permission.VIEW_REPORTS);
        TermSummary term = scope.term(termId);
        Map<String, Object> p = ReportScope.params(term, scope.blocks(block));
        List<List<Object>> rows = jdbc.sql("""
                SELECT code, student_name, student_code, type, title, amount, status, due_at, paid_at FROM rpt_v_invoice
                WHERE term_id = :term AND building_id IN (:b) AND status <> 'VOID' ORDER BY issued_at, id
                """).params(p).query((rs, i) -> Arrays.<Object>asList(rs.getString("code"), rs.getString("student_name"),
                        rs.getString("student_code"), title(rs.getString("type")), rs.getString("title"),
                        rs.getLong("amount"), title(rs.getString("status")), rs.getTimestamp("due_at").toInstant(),
                        rs.getTimestamp("paid_at") == null ? null : rs.getTimestamp("paid_at").toInstant())).list();
        return new ReportExport.Table(fileName("block-collections", block), List.of("Invoice", "Student", "Student code",
                "Type", "Title", "Amount (VND)", "Status", "Due", "Paid at"), rows);
    }

    /** Maintenance Requests of the Block(s) reported in the Term (or without a Term). */
    ReportExport.Table blockMaintenance(Long termId, String block) {
        currentUser.require(Permission.VIEW_REPORTS);
        TermSummary term = scope.term(termId);
        Map<String, Object> p = ReportScope.params(term, scope.blocks(block));
        List<List<Object>> rows = jdbc.sql("""
                SELECT code, room_code, category, priority, source, status, reported_at, resolved_at FROM rpt_v_maintenance
                WHERE building_id IN (:b) AND (term_id = :term OR term_id IS NULL) ORDER BY reported_at, id
                """).params(p).query((rs, i) -> Arrays.<Object>asList(rs.getString("code"), rs.getString("room_code"),
                        title(rs.getString("category")), title(rs.getString("priority")), title(rs.getString("source")),
                        title(rs.getString("status")), rs.getTimestamp("reported_at").toInstant(),
                        rs.getTimestamp("resolved_at") == null ? null : rs.getTimestamp("resolved_at").toInstant()))
                .list();
        return new ReportExport.Table(fileName("block-maintenance", block), List.of("Request", "Room", "Category",
                "Priority", "Source", "Status", "Reported at", "Resolved at"), rows);
    }

    /** Students holding a Bed in the Block(s) this Term (in a past Term: until check-out), with their check-in. */
    ReportExport.Table blockResidents(Long termId, String block) {
        currentUser.require(Permission.VIEW_REPORTS);
        TermSummary term = scope.term(termId);
        Map<String, Object> p = ReportScope.params(term, scope.blocks(block));
        List<List<Object>> rows = jdbc.sql("""
                SELECT b.block, b.room, b.bed, s.student_name, s.student_code, a.allocated_at, a.checked_in_at
                FROM rpt_v_allocation a JOIN rpt_v_bed b ON b.bed_id = a.bed_id
                LEFT JOIN LATERAL (SELECT x.student_name, x.student_code FROM rpt_v_application x
                                   WHERE x.term_id = a.term_id AND x.student_id = a.student_id
                                   ORDER BY x.created_at DESC LIMIT 1) s ON TRUE
                WHERE a.term_id = :term AND""" + scope.held(term, "a") + """
                AND b.building_id IN (:b)
                ORDER BY b.block, b.room, b.bed, a.allocated_at
                """).params(p).query((rs, i) -> Arrays.<Object>asList(rs.getString("block"), rs.getString("room"),
                        rs.getString("bed"), rs.getString("student_name"), rs.getString("student_code"),
                        rs.getTimestamp("allocated_at").toInstant(),
                        rs.getTimestamp("checked_in_at") == null ? null : rs.getTimestamp("checked_in_at").toInstant()))
                .list();
        return new ReportExport.Table(fileName("block-residents", block), List.of("Block", "Room", "Bed", "Student",
                "Student code", "Allocated at", "Checked in at"), rows);
    }

    // ---------------------------------------------------------------- helpers

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

    private static String fileName(String report, String block) {
        return block == null || block.isBlank() ? report : report + "-" + block.trim();
    }

    /** {@code AWAITING_CONFIRMATION} → {@code Awaiting confirmation}. */
    private static String title(String code) {
        if (code == null || code.isEmpty()) {
            return code;
        }
        String text = code.replace('_', ' ').toLowerCase(Locale.ROOT);
        return Character.toUpperCase(text.charAt(0)) + text.substring(1);
    }

    private long count(String sql, Map<String, Object> p) {
        return jdbc.sql(sql).params(p).query(Long.class).single();
    }
}
