package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.common.file.FileLinks;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.event.CheckInToAgree;
import vn.fpt.campusstay.event.CheckInVisit;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * Staff › Check-in › Inventories: the check-in inventories of the Blocks. Staff compare the student's answers with
 * the Room's record side by side, then either confirm the inventory or ask for a visit; in the visit they record
 * what they find and send it to the student, who agrees on the spot (the inventory becomes final). Staff may cancel
 * an inventory filed for the wrong Room, and accept a late report after the deadline.
 */
@Service
public class HandoverDeskService {

    /** @param comparison Matched, Minor difference or Major difference */
    public record Row(String id, String studentName, String studentCode, String room, String bed, String block,
            String status, String comparison, Instant openedAt, Instant dueAt, Instant submittedAt, Instant visitAt,
            boolean lateReport) {
    }

    public record Page(List<Row> items, long total, Map<String, Long> counts) {
    }

    public record Photo(String id, String url) {
    }

    /**
     * @param baseline       what the Room's record said; {@code baselineSource} Inspection, Inventory or Check-out
     * @param differs        the student's answer differs from the record
     */
    public record Item(String itemId, String assetCode, String type, String typeVi, String bed, boolean personal,
            String baseline, String baselineSource, String condition, String note, String verified,
            String verifiedNote, boolean differs, boolean preExisting, List<Photo> photos) {
    }

    public record Meter(BigDecimal baseline, Instant baselineAt, BigDecimal student, BigDecimal verified) {
    }

    public record Detail(Row row, List<String> differences, Meter electricity, Meter water, List<Photo> meterPhotos,
            List<Item> items, String studentComment, String confirmReason, String source, Instant finalizedAt,
            Instant utilityFrom, String lateNote, String cancelledReason, boolean sentToStudent,
            VisitWindow visitWindow) {
    }

    /**
     * When a Room visit may be set (System parameters › Room handover): from {@code fromHour} to before
     * {@code toHour} on the campus clock, from now to {@code lastDay}; {@code suggestions} are the next free hours.
     */
    public record VisitWindow(int fromHour, int toHour, LocalDate lastDay, List<Instant> suggestions) {
    }

    public record VerifyItem(String itemId, String condition, String note) {
    }

    public record Verification(List<VerifyItem> items, BigDecimal electricity, BigDecimal water) {
    }

    private record Head(long id, long allocationId, long studentId, long bedId, long termId, String status,
            String comparison, Instant openedAt, Instant dueAt, Instant submittedAt, Instant visitAt, String lateNote,
            boolean lateAccepted, long total) {
    }

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final HandoverCore core;
    private final Inventory inventory;
    private final UserDirectory users;
    private final FileLinks links;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;
    private final Parameters parameters;

    public HandoverDeskService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, HandoverCore core,
            Inventory inventory, UserDirectory users, FileLinks links, ApplicationEventPublisher events, AuditLog audit,
            Clock clock, Parameters parameters) {
        this.parameters = parameters;
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.core = core;
        this.inventory = inventory;
        this.users = users;
        this.links = links;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * @param status     To review (Submitted, the default), Verifying, Draft, Final, Late report or All
     * @param comparison Matched, Minor or Major
     */
    @Transactional(readOnly = true)
    public Page list(String block, String status, String comparison, PageQuery page) {
        currentUser.require(Permission.DESK);
        Set<Long> buildings = blockScope.resolve(block).ids();
        Map<Long, Inventory.BedSlot> beds = new HashMap<>();
        buildings.forEach(b -> inventory.bedsOfBuilding(b).forEach(s -> beds.put(s.bedId(), s)));
        if (beds.isEmpty()) {
            return new Page(List.of(), 0, Map.of());
        }
        String state = status == null || status.isBlank() ? "SUBMITTED" : switch (status.trim().toLowerCase()) {
            case "verifying" -> "VERIFYING";
            case "draft" -> "DRAFT";
            case "final" -> "FINAL";
            case "late report" -> "LATE";
            case "all" -> "ALL";
            default -> "SUBMITTED";
        };
        String level = comparison == null ? null : switch (comparison.trim().toLowerCase()) {
            case "matched" -> "MATCHED";
            case "minor", "minor difference" -> "MINOR";
            case "major", "major difference" -> "MAJOR";
            default -> null;
        };
        List<Head> heads = jdbc.sql("""
                SELECT h.id, h.allocation_id, a.student_id, a.bed_id, a.term_id, h.status, h.comparison, h.opened_at,
                       h.due_at, h.submitted_at, h.visit_at, h.late_note,
                       EXISTS (SELECT 1 FROM asg_handover_item i WHERE i.handover_id = h.id AND i.pre_existing
                               AND h.late_submitted_at IS NOT NULL AND h.confirm_reason LIKE 'Late report%') AS late_ok,
                       count(*) OVER () AS total
                FROM asg_handover h JOIN asg_allocation a ON a.id = h.allocation_id
                WHERE a.bed_id IN (:beds) AND h.status <> 'CANCELLED'
                  AND (:state = 'ALL' OR (:state = 'LATE' AND h.late_note IS NOT NULL
                                            AND (h.confirm_reason IS NULL OR h.confirm_reason NOT LIKE 'Late report%'))
                       OR h.status = :state)
                  AND (CAST(:level AS VARCHAR) IS NULL OR h.comparison = :level)
                ORDER BY CASE h.comparison WHEN 'MAJOR' THEN 0 WHEN 'MINOR' THEN 1 ELSE 2 END,
                         coalesce(h.submitted_at, h.opened_at), h.id
                LIMIT :limit OFFSET :offset
                """).param("beds", List.copyOf(beds.keySet())).param("state", state).param("level", level)
                .param("limit", page.limit()).param("offset", page.offset())
                .query((rs, i) -> new Head(rs.getLong("id"), rs.getLong("allocation_id"), rs.getLong("student_id"),
                        rs.getLong("bed_id"), rs.getLong("term_id"), rs.getString("status"), rs.getString("comparison"),
                        HandoverCore.instant(rs, "opened_at"), HandoverCore.instant(rs, "due_at"),
                        HandoverCore.instant(rs, "submitted_at"), HandoverCore.instant(rs, "visit_at"),
                        rs.getString("late_note"), rs.getBoolean("late_ok"), rs.getLong("total")))
                .list();
        Map<String, Long> counts = new HashMap<>();
        jdbc.sql("""
                SELECT h.status, count(*) AS n FROM asg_handover h JOIN asg_allocation a ON a.id = h.allocation_id
                WHERE a.bed_id IN (:beds) AND h.status <> 'CANCELLED' GROUP BY h.status
                """).param("beds", List.copyOf(beds.keySet()))
                .query((rs, i) -> Map.entry(HandoverCore.STATUSES.get(rs.getString("status")), rs.getLong("n"))).list()
                .forEach(e -> counts.put(e.getKey(), e.getValue()));
        return new Page(rows(heads, beds), heads.isEmpty() ? 0 : heads.getFirst().total(), counts);
    }

    @Transactional(readOnly = true)
    public Detail detail(String id) {
        currentUser.require(Permission.DESK);
        HandoverCore.Row h = find(id, false);
        return detail(h);
    }

    /**
     * The inventory is right as the student filed it (a Major difference needs a reason): it becomes final with the
     * student's answers and meters.
     */
    @Transactional
    public Detail confirm(String id, String reason) {
        AuthenticatedUser me = currentUser.require(Permission.DESK);
        HandoverCore.Row h = find(id, true);
        if (!h.status().equals("SUBMITTED")) {
            throw ApiException.conflict("NOT_TO_REVIEW", "Only a submitted inventory can be confirmed.");
        }
        // A major difference (an item Missing, too many items or a meter beyond the limit) is never confirmed from the
        // desk: Staff check the Room with the student.
        if ("MAJOR".equals(h.comparison())) {
            throw ApiException.conflict("MAJOR_NEEDS_VISIT",
                    "An inventory with a major difference is checked in the Room with the student: set a visit.");
        }
        String why = reason == null || reason.isBlank() ? null : reason.trim();
        if (why != null && why.length() > 500) {
            throw FieldErrors.single("reason", "Keep the reason under 500 characters.");
        }
        jdbc.sql("UPDATE asg_handover SET confirm_reason = :r, version = version + 1 WHERE id = :id")
                .param("r", why).param("id", h.id()).update();
        HandoverCore.Alloc a = core.allocation(h.allocationId()).orElseThrow();
        core.finalize(core.byId(h.id(), false).orElseThrow(), a, "STUDENT", me.userId(), Instant.now(clock));
        return detail(core.byId(h.id(), false).orElseThrow());
    }

    /**
     * Staff will check the Room with the student at {@code visitAt}: within the office hours and the days of
     * {@link #visitWindow()}. Nothing is recorded for Staff until they record what they find in the Room.
     */
    @Transactional
    public Detail requestVisit(String id, Instant visitAt) {
        AuthenticatedUser me = currentUser.require(Permission.DESK);
        HandoverCore.Row h = find(id, true);
        if (!h.status().equals("SUBMITTED")) {
            throw ApiException.conflict("NOT_TO_REVIEW", "Only a submitted inventory can be checked in the Room.");
        }
        Instant now = Instant.now(clock);
        VisitWindow window = visitWindow();
        if (visitAt == null) {
            throw FieldErrors.single("visitAt", "Choose when you come to the Room.");
        }
        ZonedDateTime at = visitAt.atZone(TimeConfig.CAMPUS_ZONE);
        if (visitAt.isBefore(now) || at.toLocalDate().isAfter(window.lastDay()) || at.getHour() < window.fromHour()
                || at.getHour() >= window.toHour()) {
            throw FieldErrors.single("visitAt", "Choose a time from " + window.fromHour() + ":00 to "
                    + window.toHour() + ":00, from now until " + DAY.format(window.lastDay()) + ".");
        }
        jdbc.sql("""
                UPDATE asg_handover SET status = 'VERIFYING', verify_requested_at = :now, verify_requested_by = :by,
                       visit_at = :visit, version = version + 1
                WHERE id = :id
                """).param("now", Timestamp.from(now)).param("by", me.userId())
                .param("visit", Timestamp.from(visitAt)).param("id", h.id()).update();
        // Nothing is copied into Staff's columns: they stay empty until Staff record what they find in the Room (an
        // item they leave out keeps the student's answer: readers take coalesce(verified, student)).
        HandoverCore.Alloc a = core.allocation(h.allocationId()).orElseThrow();
        audit.record("CHECK_IN_VISIT_REQUESTED", AuditLog.Tone.WARNING, "Check-in inventory", h.id(),
                HandoverCore.code(h.id()), null);
        events.publishEvent(new CheckInVisit(a.studentId(), roomCode(a), visitAt));
        return detail(core.byId(h.id(), false).orElseThrow());
    }

    /**
     * In the Room: what Staff found (items not sent keep the student's answer), saved and, with {@code send}, sent to
     * the student to agree.
     */
    @Transactional
    public Detail saveVerification(String id, Verification v, boolean send) {
        AuthenticatedUser me = currentUser.require(Permission.DESK);
        HandoverCore.Row h = find(id, true);
        if (!h.status().equals("VERIFYING")) {
            throw ApiException.conflict("NOT_VERIFYING", "Ask for a visit before recording what you find.");
        }
        Set<Long> items = new java.util.HashSet<>(core.items(h.id()).stream().map(HandoverCore.ItemRow::itemId).toList());
        for (VerifyItem item : v == null || v.items() == null ? List.<VerifyItem>of() : v.items()) {
            if (item == null) {
                continue;
            }
            long itemId = StudentHandoverService.parseItem(item.itemId());
            if (!items.contains(itemId)) {
                throw FieldErrors.single("items", "Record only the items of this inventory.");
            }
            String condition = StudentHandoverService.condition(item.condition());
            String note = item.note() == null || item.note().isBlank() ? null : item.note().trim();
            if (note != null && note.length() > 300) {
                throw FieldErrors.single("items", "Keep each note under 300 characters.");
            }
            jdbc.sql("""
                    UPDATE asg_handover_item SET verified_condition = coalesce(:c, verified_condition), verified_note = :n
                    WHERE handover_id = :h AND furniture_item_id = :i
                    """).param("c", condition).param("n", note).param("h", h.id()).param("i", itemId).update();
        }
        if (v != null && (v.electricity() != null || v.water() != null)) {
            FieldErrors errors = new FieldErrors();
            errors.check(v.electricity() == null || v.electricity().signum() >= 0, "electricity",
                    "Enter the electricity reading (kWh).");
            errors.check(v.water() == null || v.water().signum() >= 0, "water", "Enter the water reading (m³).");
            errors.throwIfAny();
            jdbc.sql("""
                    UPDATE asg_handover SET verified_electricity = coalesce(:e, verified_electricity),
                           verified_water = coalesce(:w, verified_water), version = version + 1
                    WHERE id = :id
                    """).param("e", v.electricity()).param("w", v.water()).param("id", h.id()).update();
        }
        if (send) {
            jdbc.sql("UPDATE asg_handover SET verified_at = :now, verified_by = :by WHERE id = :id")
                    .param("now", Timestamp.from(Instant.now(clock))).param("by", me.userId()).param("id", h.id()).update();
            HandoverCore.Alloc a = core.allocation(h.allocationId()).orElseThrow();
            audit.record("CHECK_IN_VERIFIED", AuditLog.Tone.INFO, "Check-in inventory", h.id(), HandoverCore.code(h.id()),
                    null);
            events.publishEvent(new CheckInToAgree(a.studentId(), roomCode(a)));
        }
        return detail(core.byId(h.id(), false).orElseThrow());
    }

    /** Filed for the wrong Room or by mistake: cancelled (the student may start again). */
    @Transactional
    public void cancel(String id, String reason) {
        currentUser.require(Permission.DESK);
        HandoverCore.Row h = find(id, true);
        if (h.status().equals("FINAL") || h.status().equals("CANCELLED")) {
            throw ApiException.conflict("INVENTORY_FINAL", "A final inventory cannot be cancelled.");
        }
        String why = reason == null ? "" : reason.trim();
        if (why.isEmpty() || why.length() > 300) {
            throw FieldErrors.single("reason", "Write why the inventory is cancelled (at most 300 characters).");
        }
        jdbc.sql("UPDATE asg_handover SET status = 'CANCELLED', cancelled_reason = :r, version = version + 1 WHERE id = :id")
                .param("r", why).param("id", h.id()).update();
        audit.record("CHECK_IN_INVENTORY_CANCELLED", AuditLog.Tone.WARNING, "Check-in inventory", h.id(),
                HandoverCore.code(h.id()), Map.of("reason", why));
    }

    /**
     * A late report after the deadline: Staff accept the items they agree were there before the student (marked as
     * such, never charged to them).
     */
    @Transactional
    public Detail acceptLate(String id, List<VerifyItem> items) {
        currentUser.require(Permission.DESK);
        HandoverCore.Row h = find(id, true);
        if (h.lateNote() == null) {
            throw ApiException.conflict("NO_LATE_REPORT", "The student sent no late report.");
        }
        Set<Long> mine = new java.util.HashSet<>(core.items(h.id()).stream().map(HandoverCore.ItemRow::itemId).toList());
        List<String> accepted = new ArrayList<>();
        for (VerifyItem item : items == null ? List.<VerifyItem>of() : items) {
            long itemId = StudentHandoverService.parseItem(item.itemId());
            if (!mine.contains(itemId)) {
                throw FieldErrors.single("items", "Choose items of this inventory.");
            }
            String condition = StudentHandoverService.condition(item.condition());
            if (!"DAMAGED".equals(condition) && !"MISSING".equals(condition)) {
                throw FieldErrors.single("items", "Accept items as Damaged or Missing.");
            }
            jdbc.sql("""
                    UPDATE asg_handover_item SET verified_condition = :c, pre_existing = TRUE,
                           verified_note = 'Accepted from the late report'
                    WHERE handover_id = :h AND furniture_item_id = :i
                    """).param("c", condition).param("h", h.id()).param("i", itemId).update();
            accepted.add(String.valueOf(itemId));
        }
        jdbc.sql("UPDATE asg_handover SET confirm_reason = :r, version = version + 1 WHERE id = :id")
                .param("r", "Late report reviewed (" + accepted.size() + " items accepted)").param("id", h.id()).update();
        audit.record("CHECK_IN_LATE_REVIEWED", AuditLog.Tone.INFO, "Check-in inventory", h.id(), HandoverCore.code(h.id()),
                Map.of("accepted", accepted));
        return detail(core.byId(h.id(), false).orElseThrow());
    }

    // ---------------------------------------------------------------- helpers

    private HandoverCore.Row find(String id, boolean lock) {
        HandoverCore.Row h = HandoverCore.parseCode(id).flatMap(n -> core.byId(n, lock))
                .orElseThrow(() -> ApiException.notFound("This check-in inventory does not exist."));
        HandoverCore.Alloc a = core.allocation(h.allocationId()).orElseThrow();
        Inventory.BedSlot bed = inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId());
        if (bed == null) {
            throw ApiException.notFound("This check-in inventory does not exist.");
        }
        blockScope.check(bed.buildingId());
        return h;
    }

    private String roomCode(HandoverCore.Alloc a) {
        Inventory.BedSlot bed = inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId());
        return bed == null ? "" : bed.roomCode();
    }

    private List<Row> rows(List<Head> heads, Map<Long, Inventory.BedSlot> beds) {
        Map<Long, UserDirectory.StudentProfile> students = new HashMap<>();
        heads.forEach(h -> students.computeIfAbsent(h.studentId(), s -> users.studentProfile(s).orElse(null)));
        return heads.stream().map(h -> {
            Inventory.BedSlot bed = beds.get(h.bedId());
            UserDirectory.StudentProfile s = students.get(h.studentId());
            return new Row(HandoverCore.code(h.id()), s == null ? null : s.name(), s == null ? null : s.studentCode(),
                    bed == null ? null : bed.roomCode(), bed == null ? null : bed.bedLabel(),
                    bed == null ? null : "Block " + bed.block(), HandoverCore.STATUSES.get(h.status()),
                    h.comparison() == null ? null : HandoverCore.COMPARISONS.get(h.comparison()), h.openedAt(), h.dueAt(),
                    h.submittedAt(), h.visitAt(), h.lateNote() != null && !h.lateAccepted());
        }).toList();
    }

    private Detail detail(HandoverCore.Row h) {
        HandoverCore.Alloc a = core.allocation(h.allocationId()).orElseThrow();
        Inventory.BedSlot bed = inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId());
        Map<Long, Inventory.BedSlot> beds = bed == null ? Map.of() : Map.of(bed.bedId(), bed);
        Head head = new Head(h.id(), a.id(), a.studentId(), a.bedId(), a.termId(), h.status(), h.comparison(),
                h.openedAt(), h.dueAt(), h.submittedAt(), h.visitAt(), h.lateNote(),
                h.confirmReason() != null && h.confirmReason().startsWith("Late report"), 1);
        Row row = rows(List.of(head), beds).getFirst();
        Map<Long, Inventory.FurnitureLine> lines = new HashMap<>();
        inventory.furnitureLines(h.roomId()).forEach(l -> lines.put(l.id(), l));
        List<HandoverCore.PhotoRow> photos = core.photos(h.id());
        List<Item> items = core.items(h.id()).stream().map(i -> {
            Inventory.FurnitureLine line = lines.get(i.itemId());
            boolean differs = i.baseline() != null && i.condition() != null
                    && !HandoverComparison.same(i.condition(), i.baseline());
            return new Item("furniture-" + i.itemId(), line == null ? null : line.assetCode(),
                    line == null ? null : line.type(), line == null ? null : line.typeVi(),
                    line == null ? null : line.bedLabel(), line != null && line.personal(),
                    StudentHandoverService.label(i.baseline()), i.baselineSource() == null ? null
                            : switch (i.baselineSource()) {
                                case "INSPECTION" -> "Inspection";
                                case "HANDOVER" -> "Inventory";
                                default -> "Check-out";
                            },
                    StudentHandoverService.label(i.condition()), i.note(), StudentHandoverService.label(i.verified()),
                    i.verifiedNote(), differs, i.preExisting(),
                    photos.stream().filter(p -> Objects.equals(p.itemId(), i.itemId()))
                            .map(p -> new Photo(String.valueOf(p.id()), links.link(p.fileId()))).toList());
        }).toList();
        List<Photo> meterPhotos = photos.stream().filter(p -> p.itemId() == null)
                .map(p -> new Photo(String.valueOf(p.id()), links.link(p.fileId()))).toList();
        List<String> differences = h.comparisonNote() == null ? List.of() : List.of(h.comparisonNote().split("\n"));
        return new Detail(row, differences,
                new Meter(h.baselineElectricity(), h.baselineAt(), h.electricity(), h.verifiedElectricity()),
                new Meter(h.baselineWater(), h.baselineAt(), h.water(), h.verifiedWater()), meterPhotos, items,
                h.studentComment(), h.confirmReason(), h.source() == null ? null : switch (h.source()) {
                    case "AUTO" -> "Deadline passed";
                    case "VERIFIED" -> "Checked in the Room";
                    default -> "As filed";
                }, h.finalizedAt(), h.utilityFrom(), h.lateNote(), h.cancelledReason(), h.verifiedAt() != null,
                h.status().equals("SUBMITTED") ? visitWindow() : null);
    }

    /** The office hours and days a Room visit may be set in, and the next free hours (every 2 hours). */
    VisitWindow visitWindow() {
        int from = Math.clamp(parameters.intValue("handover.visit_from_hour"), 0, 23);
        int to = Math.clamp(parameters.intValue("handover.visit_to_hour"), from + 1, 24);
        int days = Math.max(0, parameters.intValue("handover.visit_within_days"));
        ZonedDateTime now = Instant.now(clock).atZone(TimeConfig.CAMPUS_ZONE);
        LocalDate last = now.toLocalDate().plusDays(days);
        List<Instant> suggestions = new ArrayList<>();
        ZonedDateTime slot = now.truncatedTo(ChronoUnit.HOURS).plusHours(1);
        while (suggestions.size() < 4 && !slot.toLocalDate().isAfter(last)) {
            if (slot.getHour() >= from && slot.getHour() < to) {
                suggestions.add(slot.toInstant());
                slot = slot.plusHours(2);
            } else {
                slot = slot.plusHours(1);
            }
        }
        return new VisitWindow(from, to, last, suggestions);
    }
}
