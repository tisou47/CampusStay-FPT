package vn.fpt.campusstay.bil.internal;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.auth.AuthenticatedUser;
import vn.fpt.campusstay.auth.BlockScope;
import vn.fpt.campusstay.auth.BlockSelection;
import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.auth.Role;
import vn.fpt.campusstay.auth.UserDirectory;
import vn.fpt.campusstay.bil.RoomStays;
import vn.fpt.campusstay.cfg.Catalog;
import vn.fpt.campusstay.cfg.UtilityPolicy;
import vn.fpt.campusstay.inv.Inventory;
import vn.fpt.campusstay.shared.audit.AuditLog;
import vn.fpt.campusstay.shared.error.ApiException;
import vn.fpt.campusstay.shared.error.FieldErrors;
import vn.fpt.campusstay.shared.time.TimeConfig;
import vn.fpt.campusstay.shared.web.PageQuery;

/**
 * Meter readings and Utility Invoices per Block and calendar month. Staff enter
 * (or import) each occupied Room's readings; a reading far above the Room's
 * usual use is flagged "Check value" until confirmed. Closing the period
 * splits each Room's cost between its residents ({@link UtilitySplit}) and
 * issues one Utility Invoice per student; students who checked out during the
 * period were already settled from their Utility Deposit.
 */
@Service
public class MeterService {

    public record PeriodItem(String id, String label, boolean closed) {
    }

    public record Periods(List<PeriodItem> items) {
    }

    public record PeriodRef(String id, String label, boolean closed, Instant dueAt) {
    }

    public record Cut(LocalDate date, BigDecimal value) {
    }

    public record Meter(BigDecimal previous, BigDecimal current, Cut cut) {
    }

    public record ReadingItem(String room, String roomTypeName, String roomClassName, int residents, Meter electricity,
            Meter water, String status) {
    }

    public record Summary(long roomsDue, long entered, long missing, long segments) {
    }

    public record ReadingsPage(PeriodRef period, Summary summary, List<ReadingItem> items, long total) {
    }

    public record SegmentView(LocalDate from, LocalDate to, int residents, BigDecimal kwh, BigDecimal m3,
            long electricityCost, long waterCost) {
    }

    public record ShareView(String label, long amount) {
    }

    public record RoomReading(String room, String roomTypeName, String roomClassName, int residents, Meter electricity,
            Meter water, String status, long priceKwh, long priceM3, String roundingNote, List<SegmentView> segments,
            List<ShareView> shares) {
    }

    public record Imported(int imported) {
    }

    public record Closed(int invoicesIssued) {
    }

    private record Period(long id, long buildingId, String label, LocalDate start, LocalDate end, Instant dueAt,
            Instant closedAt) {

        Instant from() {
            return start.atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant();
        }

        Instant to() {
            return end.plusDays(1).atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant();
        }
    }

    private record Reading(long id, long roomId, BigDecimal electricityPrev, BigDecimal electricityCurr,
            BigDecimal waterPrev, BigDecimal waterCurr, String status) {
    }

    private record CutRow(LocalDate day, Instant at, BigDecimal electricity, BigDecimal water) {
    }

    private record Room(long id, String code, long typeId, long classId) {
    }

    private static final Map<String, String> STATUSES = Map.of("MISSING", "Missing", "ENTERED", "Entered",
            "CHECK_VALUE", "Check value", "CONFIRMED", "Confirmed");
    private static final DateTimeFormatter LABEL = DateTimeFormatter.ofPattern("MM/yyyy");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM");
    /** A month's use more than this many times the Room's previous month is flagged for a second look. */
    private static final BigDecimal CHECK_FACTOR = BigDecimal.valueOf(3);

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final Inventory inventory;
    private final Catalog catalog;
    private final RoomStays stays;
    private final UserDirectory users;
    private final UtilityPolicy utility;
    private final JdbcBilling billing;
    private final AuditLog audit;
    private final Clock clock;

    public MeterService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, Inventory inventory,
            Catalog catalog, RoomStays stays, UserDirectory users, UtilityPolicy utility, JdbcBilling billing,
            AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.inventory = inventory;
        this.catalog = catalog;
        this.stays = stays;
        this.users = users;
        this.utility = utility;
        this.billing = billing;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- periods

    /** The Block's periods, newest first; the current month's period is opened on first use. */
    @Transactional
    public Periods periods(String block) {
        long building = building(block);
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        LocalDate start = today.withDayOfMonth(1);
        LocalDate end = today.withDayOfMonth(today.lengthOfMonth());
        Instant due = end.plusDays(1 + utility.prices().paymentDueDays()).atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant();
        jdbc.sql("""
                INSERT INTO bil_meter_period (building_id, label, period_start, period_end, due_at)
                VALUES (:b, :label, :start, :end, :due) ON CONFLICT (building_id, period_start) DO NOTHING
                """).param("b", building).param("label", LABEL.format(start)).param("start", start).param("end", end)
                .param("due", Timestamp.from(due)).update();
        return new Periods(jdbc.sql("SELECT * FROM bil_meter_period WHERE building_id = :b ORDER BY period_start DESC")
                .param("b", building).query(MeterService::period).list().stream()
                .map(p -> new PeriodItem(String.valueOf(p.id()), p.label(), p.closedAt() != null)).toList());
    }

    // ---------------------------------------------------------------- readings

    /** @param status a status label (Missing, Entered, Check value, Confirmed) */
    @Transactional
    public ReadingsPage readings(String periodId, String status, PageQuery page) {
        Period p = period(periodId, false);
        Map<Long, Room> rooms = rooms(p.buildingId());
        if (p.closedAt() == null) {
            ensureRows(p, rooms);
        }
        List<Reading> rows = rows(p.id());
        Map<Long, List<CutRow>> cuts = cuts(rows.stream().map(Reading::roomId).toList(), p);
        Map<Long, Long> residents = stays.stays(rows.stream().map(Reading::roomId).toList(), p.from(), p.to()).stream()
                .collect(Collectors.groupingBy(RoomStays.Stay::roomId,
                        Collectors.collectingAndThen(Collectors.mapping(RoomStays.Stay::studentId, Collectors.toSet()),
                                s -> (long) s.size())));
        String code = status == null || status.isBlank() ? null : STATUSES.entrySet().stream()
                .filter(e -> e.getValue().equalsIgnoreCase(status.trim())).map(Map.Entry::getKey).findFirst()
                .orElseThrow(() -> FieldErrors.single("status", "Choose Missing, Entered, Check value or Confirmed."));
        Names names = names();
        List<ReadingItem> items = rows.stream().filter(r -> code == null || r.status().equals(code))
                .sorted(Comparator.comparing(r -> rooms.get(r.roomId()).code()))
                .map(r -> item(r, rooms.get(r.roomId()), residents.getOrDefault(r.roomId(), 0L).intValue(),
                        cuts.getOrDefault(r.roomId(), List.of()), names))
                .toList();
        long missing = rows.stream().filter(r -> r.status().equals("MISSING")).count();
        Summary summary = new Summary(rows.size(), rows.size() - missing, missing,
                cuts.values().stream().mapToLong(List::size).sum());
        return new ReadingsPage(ref(p), summary, items.stream().skip(page.offset()).limit(page.limit()).toList(),
                items.size());
    }

    @Transactional(readOnly = true)
    public RoomReading room(String periodId, String roomCode) {
        Period p = period(periodId, false);
        Map<Long, Room> rooms = rooms(p.buildingId());
        Reading r = reading(p, rooms, roomCode);
        Room room = rooms.get(r.roomId());
        List<CutRow> cuts = cuts(List.of(r.roomId()), p).getOrDefault(r.roomId(), List.of());
        List<RoomStays.Stay> residents = stays.stays(List.of(r.roomId()), p.from(), p.to());
        UtilityPolicy.Prices prices = utility.prices();
        ReadingItem item = item(r, room, (int) residents.stream().map(RoomStays.Stay::studentId).distinct().count(), cuts,
                names());
        UtilitySplit.Result split = UtilitySplit.split(points(p, r, cuts), residentsOf(residents), prices);
        Map<Long, String> who = users.displayNames(split.shares().stream().map(UtilitySplit.Share::studentId).toList());
        return new RoomReading(item.room(), item.roomTypeName(), item.roomClassName(), item.residents(),
                item.electricity(), item.water(), item.status(), prices.priceKwh(), prices.priceM3(),
                roundingNote(prices), split.segments().stream().map(MeterService::segment).toList(),
                split.shares().stream().map(s -> new ShareView(who.get(s.studentId())
                        + (s.settled() ? " (settled at check-out)" : ""), s.amount())).toList());
    }

    @Transactional
    public void save(String periodId, String roomCode, BigDecimal electricity, BigDecimal water) {
        AuthenticatedUser user = currentUser.require(Role.STAFF, Role.MANAGER);
        Period p = period(periodId, true);
        open(p);
        Map<Long, Room> rooms = rooms(p.buildingId());
        Reading r = reading(p, rooms, roomCode);
        apply(p, r, electricity, water, user.userId());
    }

    @Transactional
    public void confirm(String periodId, String roomCode) {
        AuthenticatedUser user = currentUser.require(Role.STAFF, Role.MANAGER);
        Period p = period(periodId, true);
        open(p);
        Reading r = reading(p, rooms(p.buildingId()), roomCode);
        if (r.status().equals("MISSING")) {
            throw ApiException.conflict("READING_MISSING", "Enter the reading before you confirm it.");
        }
        jdbc.sql("UPDATE bil_meter_reading SET status = 'CONFIRMED', confirmed_by = :by, confirmed_at = :now WHERE id = :id")
                .param("by", user.userId()).param("now", Timestamp.from(Instant.now(clock))).param("id", r.id()).update();
    }

    /** CSV {@code room,electricity,water} with a header line; every line is checked before any is saved. */
    @Transactional
    public Imported importCsv(String periodId, byte[] file) {
        AuthenticatedUser user = currentUser.require(Role.STAFF, Role.MANAGER);
        Period p = period(periodId, true);
        open(p);
        if (file == null || file.length == 0) {
            throw FieldErrors.single("file", "Choose a CSV file.");
        }
        Map<Long, Room> rooms = rooms(p.buildingId());
        ensureRows(p, rooms);
        Map<String, Reading> byRoom = new HashMap<>();
        rows(p.id()).forEach(r -> byRoom.put(rooms.get(r.roomId()).code().toUpperCase(Locale.ROOT), r));
        record Line(Reading reading, BigDecimal electricity, BigDecimal water) {
        }
        List<Line> lines = new ArrayList<>();
        List<String> problems = new ArrayList<>();
        try (BufferedReader in = new BufferedReader(new StringReader(new String(file, StandardCharsets.UTF_8)))) {
            String text;
            int n = 0;
            while ((text = in.readLine()) != null) {
                n++;
                String[] cells = text.replace("\uFEFF", "").split("[,;]");
                if (text.isBlank() || (n == 1 && cells[0].trim().equalsIgnoreCase("room"))) {
                    continue;
                }
                Reading r = cells.length < 3 ? null : byRoom.get(cells[0].trim().toUpperCase(Locale.ROOT));
                BigDecimal e = cells.length < 3 ? null : number(cells[1]);
                BigDecimal w = cells.length < 3 ? null : number(cells[2]);
                if (r == null) {
                    problems.add("Line " + n + ": the Room is not in this period.");
                } else if (e == null || w == null) {
                    problems.add("Line " + n + ": enter two readings.");
                } else {
                    lines.add(new Line(r, e, w));
                }
            }
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
        if (!problems.isEmpty()) {
            throw FieldErrors.single("file", String.join(" ", problems.subList(0, Math.min(5, problems.size()))));
        }
        for (Line l : lines) {
            apply(p, l.reading(), l.electricity(), l.water(), user.userId());
        }
        return new Imported(lines.size());
    }

    /** Issues the period's Utility Invoices; every Room needs a reading and no value may wait for a check. */
    @Transactional
    public Closed close(String periodId) {
        AuthenticatedUser user = currentUser.require(Role.STAFF, Role.MANAGER);
        Period p = period(periodId, true);
        open(p);
        Map<Long, Room> rooms = rooms(p.buildingId());
        ensureRows(p, rooms);
        List<Reading> rows = rows(p.id());
        long missing = rows.stream().filter(r -> r.status().equals("MISSING")).count();
        if (missing > 0) {
            throw ApiException.conflict("READINGS_MISSING", missing + (missing == 1 ? " Room has" : " Rooms have")
                    + " no reading yet.");
        }
        long check = rows.stream().filter(r -> r.status().equals("CHECK_VALUE")).count();
        if (check > 0) {
            throw ApiException.conflict("READINGS_TO_CHECK", "Confirm the " + check
                    + (check == 1 ? " reading" : " readings") + " marked Check value first.");
        }
        UtilityPolicy.Prices prices = utility.prices();
        Map<Long, List<CutRow>> cuts = cuts(rows.stream().map(Reading::roomId).toList(), p);
        List<RoomStays.Stay> all = stays.stays(rows.stream().map(Reading::roomId).toList(), p.from(), p.to());
        int issued = 0;
        for (Reading r : rows) {
            Room room = rooms.get(r.roomId());
            List<CutRow> roomCuts = cuts.getOrDefault(r.roomId(), List.of());
            UtilitySplit.Result split = UtilitySplit.split(points(p, r, roomCuts),
                    residentsOf(all.stream().filter(s -> s.roomId() == r.roomId()).toList()), prices);
            for (UtilitySplit.Share share : split.shares()) {
                if (share.settled() || share.amount() <= 0) {
                    continue;
                }
                billing.issueUtility(share.termId(), share.studentId(), share.allocationId(),
                        p.buildingId(), p.label(), share.amount(),
                        List.of(Map.of("label", "Electricity and water · Room " + room.code(), "amount", share.amount())),
                        breakdown(split, share.studentId(), room.code(), prices), p.dueAt(),
                        "Room " + room.code() + " · " + p.label());
                issued++;
            }
        }
        jdbc.sql("UPDATE bil_meter_period SET closed_at = :now, closed_by = :by WHERE id = :id")
                .param("now", Timestamp.from(Instant.now(clock))).param("by", user.userId()).param("id", p.id()).update();
        audit.record("METER_PERIOD_CLOSED", AuditLog.Tone.SUCCESS, "Meter period", p.id(), p.label(),
                Map.of("invoices", issued));
        return new Closed(issued);
    }

    // ---------------------------------------------------------------- helpers

    private void apply(Period p, Reading r, BigDecimal electricity, BigDecimal water, long by) {
        FieldErrors errors = new FieldErrors();
        errors.check(electricity != null && electricity.signum() >= 0, "electricity", "Enter the electricity reading.");
        errors.check(water != null && water.signum() >= 0, "water", "Enter the water reading.");
        errors.throwIfAny();
        boolean baseline = previousValue(r.roomId(), p.start()).isEmpty();
        List<CutRow> roomCuts = cuts(List.of(r.roomId()), p).getOrDefault(r.roomId(), List.of());
        BigDecimal eFloor = roomCuts.isEmpty() ? r.electricityPrev() : roomCuts.getLast().electricity();
        BigDecimal wFloor = roomCuts.isEmpty() ? r.waterPrev() : roomCuts.getLast().water();
        if (!baseline || !roomCuts.isEmpty()) {
            NumberFormat number = NumberFormat.getNumberInstance(Locale.US);
            errors.check(electricity.compareTo(eFloor) >= 0, "electricity",
                    "The reading is lower than the last one (" + number.format(eFloor) + " kWh).");
            errors.check(water.compareTo(wFloor) >= 0, "water",
                    "The reading is lower than the last one (" + number.format(wFloor) + " m³).");
            errors.throwIfAny();
        }
        BigDecimal ePrev = baseline && roomCuts.isEmpty() ? electricity : r.electricityPrev();
        BigDecimal wPrev = baseline && roomCuts.isEmpty() ? water : r.waterPrev();
        BigDecimal lastUse = lastUse(r.roomId(), p.start());
        BigDecimal use = electricity.subtract(ePrev);
        String status = lastUse != null && lastUse.signum() > 0 && use.compareTo(lastUse.multiply(CHECK_FACTOR)) > 0
                ? "CHECK_VALUE" : "ENTERED";
        jdbc.sql("""
                UPDATE bil_meter_reading SET electricity_prev = :ePrev, electricity_curr = :e, water_prev = :wPrev,
                       water_curr = :w, status = :status, entered_by = :by, entered_at = :now, confirmed_by = NULL,
                       confirmed_at = NULL
                WHERE id = :id
                """).param("ePrev", ePrev).param("e", electricity).param("wPrev", wPrev).param("w", water)
                .param("status", status).param("by", by).param("now", Timestamp.from(Instant.now(clock)))
                .param("id", r.id()).update();
    }

    /** One reading row per Room someone lived in during the period, starting from the Room's last value. */
    private void ensureRows(Period p, Map<Long, Room> rooms) {
        Set<Long> occupied = stays.stays(rooms.keySet(), p.from(), p.to()).stream().map(RoomStays.Stay::roomId)
                .collect(Collectors.toSet());
        Set<Long> existing = Set.copyOf(jdbc.sql("SELECT room_id FROM bil_meter_reading WHERE period_id = :p")
                .param("p", p.id()).query(Long.class).list());
        for (long room : occupied) {
            if (existing.contains(room)) {
                continue;
            }
            BigDecimal[] prev = previousValue(room, p.start()).orElse(new BigDecimal[] { BigDecimal.ZERO, BigDecimal.ZERO });
            jdbc.sql("""
                    INSERT INTO bil_meter_reading (period_id, room_id, electricity_prev, water_prev)
                    VALUES (:p, :room, :e, :w) ON CONFLICT (period_id, room_id) DO NOTHING
                    """).param("p", p.id()).param("room", room).param("e", prev[0]).param("w", prev[1]).update();
        }
    }

    /** The Room's last value before the period: an earlier period's reading or a reading at a resident change. */
    private Optional<BigDecimal[]> previousValue(long roomId, LocalDate before) {
        return jdbc.sql("""
                SELECT electricity, water FROM (
                    SELECT p.period_end AS day, r.electricity_curr AS electricity, r.water_curr AS water, 0 AS rank
                    FROM bil_meter_reading r JOIN bil_meter_period p ON p.id = r.period_id
                    WHERE r.room_id = :room AND p.period_end < :before AND r.electricity_curr IS NOT NULL
                    UNION ALL
                    SELECT cut_date, electricity, water, 1 FROM bil_meter_cut WHERE room_id = :room AND cut_date < :before
                ) x ORDER BY day DESC, rank DESC LIMIT 1
                """).param("room", roomId).param("before", before)
                .query((rs, i) -> new BigDecimal[] { rs.getBigDecimal("electricity"), rs.getBigDecimal("water") })
                .optional();
    }

    /** kWh the Room used in the latest earlier period, or null. */
    private BigDecimal lastUse(long roomId, LocalDate before) {
        return jdbc.sql("""
                SELECT r.electricity_curr - r.electricity_prev FROM bil_meter_reading r
                JOIN bil_meter_period p ON p.id = r.period_id
                WHERE r.room_id = :room AND p.period_end < :before AND r.electricity_curr IS NOT NULL
                ORDER BY p.period_end DESC LIMIT 1
                """).param("room", roomId).param("before", before).query(BigDecimal.class).optional().orElse(null);
    }

    private static List<UtilitySplit.Point> points(Period p, Reading r, List<CutRow> cuts) {
        List<UtilitySplit.Point> points = new ArrayList<>();
        points.add(new UtilitySplit.Point(p.start(), p.from(), r.electricityPrev(), r.waterPrev()));
        cuts.forEach(c -> points.add(new UtilitySplit.Point(c.day(), c.at(), c.electricity(), c.water())));
        if (r.electricityCurr() != null && r.waterCurr() != null) {
            points.add(new UtilitySplit.Point(p.end(), p.to(), r.electricityCurr(), r.waterCurr()));
        }
        return points;
    }

    private static List<UtilitySplit.Resident> residentsOf(List<RoomStays.Stay> stays) {
        return stays.stream().map(s -> new UtilitySplit.Resident(s.studentId(), s.allocationId(), s.termId(), s.from(),
                s.to(), s.checkedOut())).toList();
    }

    private static Map<String, Object> breakdown(UtilitySplit.Result split, long studentId, String room,
            UtilityPolicy.Prices prices) {
        List<Map<String, Object>> segments = new ArrayList<>();
        long subtotal = 0;
        for (UtilitySplit.Segment s : split.segments()) {
            long share = s.shares().getOrDefault(studentId, BigDecimal.ZERO).setScale(0, RoundingMode.HALF_UP)
                    .longValueExact();
            subtotal += share;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("from", s.from().toString());
            m.put("to", s.to().toString());
            m.put("note", DAY.format(s.from()) + " – " + DAY.format(s.to()));
            m.put("residents", s.residents());
            m.put("kwh", s.kwh());
            m.put("m3", s.m3());
            m.put("electricityCost", s.electricityCost());
            m.put("waterCost", s.waterCost());
            m.put("share", share);
            segments.add(m);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("room", room);
        result.put("segments", segments);
        result.put("subtotal", subtotal);
        result.put("roundingNote", roundingNote(prices));
        result.put("priceKwh", prices.priceKwh());
        result.put("priceM3", prices.priceM3());
        return result;
    }

    private static String roundingNote(UtilityPolicy.Prices prices) {
        long rounded = prices.round(1);
        return rounded <= 1 ? "Shares are not rounded."
                : "Each share is rounded up to " + NumberFormat.getIntegerInstance(Locale.US).format(rounded) + " VND.";
    }

    private static SegmentView segment(UtilitySplit.Segment s) {
        return new SegmentView(s.from(), s.to(), s.residents(), s.kwh(), s.m3(), s.electricityCost(), s.waterCost());
    }

    private ReadingItem item(Reading r, Room room, int residents, List<CutRow> cuts, Names names) {
        CutRow cut = cuts.isEmpty() ? null : cuts.getLast();
        return new ReadingItem(room.code(), names.types().get(room.typeId()), names.classes().get(room.classId()),
                residents,
                new Meter(r.electricityPrev(), r.electricityCurr(), cut == null ? null : new Cut(cut.day(), cut.electricity())),
                new Meter(r.waterPrev(), r.waterCurr(), cut == null ? null : new Cut(cut.day(), cut.water())),
                STATUSES.get(r.status()));
    }

    private Map<Long, List<CutRow>> cuts(List<Long> roomIds, Period p) {
        Map<Long, List<CutRow>> result = new HashMap<>();
        if (roomIds.isEmpty()) {
            return result;
        }
        jdbc.sql("""
                SELECT room_id, cut_date, created_at, electricity, water FROM bil_meter_cut
                WHERE room_id IN (:rooms) AND cut_date >= :start AND cut_date <= :end
                ORDER BY cut_date, created_at
                """).param("rooms", roomIds).param("start", p.start()).param("end", p.end())
                .query((rs, i) -> Map.entry(rs.getLong("room_id"), new CutRow(rs.getObject("cut_date", LocalDate.class),
                        rs.getTimestamp("created_at").toInstant(), rs.getBigDecimal("electricity"),
                        rs.getBigDecimal("water"))))
                .list().forEach(e -> result.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        return result;
    }

    private List<Reading> rows(long periodId) {
        return jdbc.sql("SELECT * FROM bil_meter_reading WHERE period_id = :p").param("p", periodId)
                .query((rs, i) -> new Reading(rs.getLong("id"), rs.getLong("room_id"), rs.getBigDecimal("electricity_prev"),
                        rs.getBigDecimal("electricity_curr"), rs.getBigDecimal("water_prev"),
                        rs.getBigDecimal("water_curr"), rs.getString("status")))
                .list();
    }

    private Reading reading(Period p, Map<Long, Room> rooms, String roomCode) {
        Room room = rooms.values().stream().filter(r -> r.code().equalsIgnoreCase(roomCode == null ? "" : roomCode.trim()))
                .findFirst().orElseThrow(() -> ApiException.notFound("Room " + roomCode + " is not in this Block."));
        return rows(p.id()).stream().filter(r -> r.roomId() == room.id()).findFirst()
                .orElseThrow(() -> ApiException.notFound("Room " + room.code() + " has no reading in this period."));
    }

    private Map<Long, Room> rooms(long buildingId) {
        Map<Long, Room> rooms = new LinkedHashMap<>();
        inventory.bedsOfBuilding(buildingId).forEach(b -> rooms.putIfAbsent(b.roomId(),
                new Room(b.roomId(), b.roomCode(), b.roomTypeId(), b.roomClassId())));
        return rooms;
    }

    private Period period(String id, boolean lock) {
        Period p = parse(id).flatMap(n -> jdbc.sql("SELECT * FROM bil_meter_period WHERE id = :id" + (lock ? " FOR UPDATE" : ""))
                .param("id", n).query(MeterService::period).optional())
                .orElseThrow(() -> ApiException.notFound("This period does not exist."));
        blockScope.check(p.buildingId());
        return p;
    }

    private static void open(Period p) {
        if (p.closedAt() != null) {
            throw ApiException.conflict("PERIOD_CLOSED", "This period is closed: its Invoices are issued.");
        }
    }

    private long building(String block) {
        BlockSelection selection = blockScope.resolve(block);
        if (!selection.single()) {
            throw FieldErrors.single("block", "Choose a Block.");
        }
        return selection.singleId();
    }

    private record Names(Map<Long, String> types, Map<Long, String> classes) {
    }

    private Names names() {
        return new Names(
                catalog.roomTypes().stream().collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name)),
                catalog.roomClasses().stream()
                        .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name)));
    }

    private static PeriodRef ref(Period p) {
        return new PeriodRef(String.valueOf(p.id()), p.label(), p.closedAt() != null, p.dueAt());
    }

    private static BigDecimal number(String cell) {
        try {
            BigDecimal value = new BigDecimal(cell.trim());
            return value.signum() < 0 || value.stripTrailingZeros().scale() > 1 ? null : value;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Optional<Long> parse(String value) {
        if (value == null || value.isBlank() || value.length() > 18 || !value.trim().chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(value.trim()));
    }

    private static Period period(ResultSet rs, int i) throws SQLException {
        Timestamp closed = rs.getTimestamp("closed_at");
        return new Period(rs.getLong("id"), rs.getLong("building_id"), rs.getString("label"),
                rs.getObject("period_start", LocalDate.class), rs.getObject("period_end", LocalDate.class),
                rs.getTimestamp("due_at").toInstant(), closed == null ? null : closed.toInstant());
    }
}
