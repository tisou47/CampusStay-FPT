package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.audit.Actor;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.CheckInInventoryFinal;
import vn.fpt.campusstay.event.FurnitureFoundDamaged;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * The check-in inventory's records (V78) and the rules both the student's and Staff's screens share: the Room's
 * baseline, the comparison and the finalisation (Utility start, damage found, desk check-in). Package-private: the
 * services call it inside their transactions.
 */
@Component
class HandoverCore {

    static final Map<String, String> STATUSES = Map.of("DRAFT", "Draft", "SUBMITTED", "Submitted", "VERIFYING",
            "Verifying", "FINAL", "Final", "CANCELLED", "Cancelled");
    static final Map<String, String> COMPARISONS = Map.of("MATCHED", "Matched", "MINOR", "Minor difference", "MAJOR",
            "Major difference");

    /** An inventory row. */
    record Row(long id, long allocationId, long roomId, String status, String source, Instant openedAt, Instant dueAt,
            Instant submittedAt, BigDecimal electricity, BigDecimal water, BigDecimal baselineElectricity,
            BigDecimal baselineWater, Instant baselineAt, String comparison, String comparisonNote,
            Instant verifyRequestedAt, Instant visitAt, Instant verifiedAt, BigDecimal verifiedElectricity,
            BigDecimal verifiedWater, String studentComment, String confirmReason, Instant finalizedAt,
            Long finalizedBy, Instant utilityFrom, String cancelledReason, String lateNote, Instant lateSubmittedAt,
            int remindersSent) {
    }

    /** One item of the inventory with what each side said. */
    record ItemRow(long itemId, String condition, String note, String baseline, String baselineSource,
            String verified, String verifiedNote, boolean preExisting) {

        /** What counts: Staff's answer after a visit, else the student's, else the record's. */
        String finalCondition() {
            return verified != null ? verified : condition != null ? condition : baseline;
        }
    }

    record PhotoRow(long id, Long itemId, long fileId) {
    }

    /** The Allocation the inventory is for. */
    record Alloc(long id, long termId, long studentId, long bedId, String renewal, Instant codeReleasedAt,
            Instant residentAt, Instant checkedInAt, boolean handoverNeeded, Instant eligibleAt) {
    }

    /** The baseline of an item: its latest recorded condition. */
    record Baseline(String condition, String source, Instant at) {
    }

    private final JdbcClient jdbc;
    private final Inventory inventory;
    private final InspectionRecords inspections;
    private final Billing billing;
    private final Residences residences;
    private final Parameters parameters;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    HandoverCore(JdbcClient jdbc, Inventory inventory, InspectionRecords inspections, Billing billing,
            Residences residences, Parameters parameters, ApplicationEventPublisher events, AuditLog audit,
            Clock clock) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.inspections = inspections;
        this.billing = billing;
        this.residences = residences;
        this.parameters = parameters;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- reads

    Optional<Alloc> allocation(long allocationId) {
        return jdbc.sql("SELECT * FROM asg_allocation WHERE id = :id").param("id", allocationId)
                .query((rs, i) -> alloc(rs)).optional();
    }

    /** The live inventory of the Allocation (not cancelled), if any. */
    Optional<Row> ofAllocation(long allocationId, boolean lock) {
        return jdbc.sql("SELECT * FROM asg_handover WHERE allocation_id = :a AND status <> 'CANCELLED'"
                + (lock ? " FOR UPDATE" : "")).param("a", allocationId).query((rs, i) -> row(rs)).optional();
    }

    Optional<Row> byId(long id, boolean lock) {
        return jdbc.sql("SELECT * FROM asg_handover WHERE id = :id" + (lock ? " FOR UPDATE" : "")).param("id", id)
                .query((rs, i) -> row(rs)).optional();
    }

    List<ItemRow> items(long handoverId) {
        return jdbc.sql("SELECT * FROM asg_handover_item WHERE handover_id = :h ORDER BY furniture_item_id")
                .param("h", handoverId)
                .query((rs, i) -> new ItemRow(rs.getLong("furniture_item_id"), rs.getString("condition"),
                        rs.getString("note"), rs.getString("baseline_condition"), rs.getString("baseline_source"),
                        rs.getString("verified_condition"), rs.getString("verified_note"), rs.getBoolean("pre_existing")))
                .list();
    }

    List<PhotoRow> photos(long handoverId) {
        return jdbc.sql("SELECT id, furniture_item_id, file_id FROM asg_handover_photo WHERE handover_id = :h ORDER BY id")
                .param("h", handoverId)
                .query((rs, i) -> new PhotoRow(rs.getLong("id"), rs.getObject("furniture_item_id", Long.class),
                        rs.getLong("file_id")))
                .list();
    }

    /** The items the student answers for: the items of their Bed and the Room's shared items (by Bed, type). */
    List<Inventory.FurnitureLine> linesFor(long roomId, long bedId) {
        return inventory.furnitureLines(roomId).stream()
                .filter(l -> !l.personal() || l.bedId() == null || l.bedId() == bedId).toList();
    }

    /**
     * The latest recorded condition of each item of the Room: a finished inspection, a final inventory of another
     * student or a check-out, whichever is the latest.
     */
    Map<Long, Baseline> baselines(long roomId, long exceptHandover) {
        Map<Long, Baseline> result = new HashMap<>();
        inspections.latestConditions(roomId)
                .forEach((item, c) -> keep(result, item, new Baseline(c.condition(), "INSPECTION", c.at())));
        jdbc.sql("""
                SELECT i.furniture_item_id, coalesce(i.verified_condition, i.condition) AS condition, h.finalized_at
                FROM asg_handover_item i JOIN asg_handover h ON h.id = i.handover_id
                WHERE h.room_id = :room AND h.status = 'FINAL' AND h.id <> :except
                  AND coalesce(i.verified_condition, i.condition) IS NOT NULL
                """).param("room", roomId).param("except", exceptHandover)
                .query((rs, i) -> Map.entry(rs.getLong("furniture_item_id"),
                        new Baseline(rs.getString("condition"), "HANDOVER", rs.getTimestamp("finalized_at").toInstant())))
                .list().forEach(e -> keep(result, e.getKey(), e.getValue()));
        List<Long> beds = inventory.bedsOfRoom(roomId).stream().map(Inventory.BedSlot::bedId).toList();
        if (!beds.isEmpty()) {
            jdbc.sql("""
                    SELECT d.furniture_item_id, d.condition, c.completed_at
                    FROM asg_check_out_damage d JOIN asg_check_out c ON c.id = d.check_out_id
                    JOIN asg_allocation a ON a.id = c.allocation_id
                    WHERE a.bed_id IN (:beds) AND c.status = 'COMPLETED' AND d.condition IS NOT NULL
                    """).param("beds", beds)
                    .query((rs, i) -> Map.entry(rs.getLong("furniture_item_id"),
                            new Baseline(rs.getString("condition"), "CHECK_OUT",
                                    rs.getTimestamp("completed_at").toInstant())))
                    .list().forEach(e -> keep(result, e.getKey(), e.getValue()));
        }
        return result;
    }

    private static void keep(Map<Long, Baseline> result, long item, Baseline candidate) {
        Baseline current = result.get(item);
        if (current == null || candidate.at().isAfter(current.at())) {
            result.put(item, candidate);
        }
    }

    /** The Room's latest meters: a meter reading of Billing or an inspection, whichever is higher (meters only grow). */
    Optional<InspectionRecords.Meters> baselineMeters(long roomId) {
        Optional<InspectionRecords.Meters> inspected = inspections.latestMeters(roomId);
        Optional<InspectionRecords.Meters> billed = billing.lastReading(roomId).map(r -> new InspectionRecords.Meters(
                r.electricity(), r.water(), r.date().atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant()));
        if (inspected.isEmpty()) {
            return billed;
        }
        if (billed.isEmpty()) {
            return inspected;
        }
        return inspected.get().electricity().compareTo(billed.get().electricity()) >= 0 ? inspected : billed;
    }

    /** The other students' final inventories of the Room, for prefilling shared items: item id → condition. */
    Map<Long, String> roommateAnswers(long roomId, long exceptAllocation) {
        Map<Long, String> answers = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT DISTINCT ON (i.furniture_item_id) i.furniture_item_id,
                       coalesce(i.verified_condition, i.condition) AS condition
                FROM asg_handover_item i JOIN asg_handover h ON h.id = i.handover_id
                JOIN asg_allocation a ON a.id = h.allocation_id
                WHERE h.room_id = :room AND h.status = 'FINAL' AND h.source <> 'AUTO' AND h.allocation_id <> :me
                  AND a.status = 'ACTIVE' AND coalesce(i.verified_condition, i.condition) IS NOT NULL
                ORDER BY i.furniture_item_id, h.finalized_at DESC
                """).param("room", roomId).param("me", exceptAllocation)
                .query((rs, i) -> Map.entry(rs.getLong("furniture_item_id"), rs.getString("condition"))).list()
                .forEach(e -> answers.put(e.getKey(), e.getValue()));
        return answers;
    }

    // ---------------------------------------------------------------- writes

    /** A new inventory for the Allocation: its items with their baseline, and the Room's meters before it. */
    long open(Alloc a, Inventory.BedSlot bed, Instant now) {
        Instant due = now.plus(Duration.ofHours(parameters.intValue("handover.submit_hours")));
        Optional<InspectionRecords.Meters> meters = baselineMeters(bed.roomId());
        long id = jdbc.sql("""
                INSERT INTO asg_handover (allocation_id, room_id, status, opened_at, due_at, baseline_electricity,
                                          baseline_water, baseline_at)
                VALUES (:a, :room, 'DRAFT', :now, :due, :e, :w, :at) RETURNING id
                """).param("a", a.id()).param("room", bed.roomId()).param("now", Timestamp.from(now))
                .param("due", Timestamp.from(due)).param("e", meters.map(InspectionRecords.Meters::electricity).orElse(null))
                .param("w", meters.map(InspectionRecords.Meters::water).orElse(null))
                .param("at", meters.map(m -> Timestamp.from(m.at())).orElse(null)).query(Long.class).single();
        Map<Long, Baseline> baselines = baselines(bed.roomId(), id);
        for (Inventory.FurnitureLine line : linesFor(bed.roomId(), bed.bedId())) {
            Baseline b = baselines.get(line.id());
            jdbc.sql("""
                    INSERT INTO asg_handover_item (handover_id, furniture_item_id, baseline_condition, baseline_source)
                    VALUES (:h, :item, :condition, :source)
                    """).param("h", id).param("item", line.id()).param("condition", b == null ? null : b.condition())
                    .param("source", b == null ? null : b.source()).update();
        }
        return id;
    }

    /** Compares the student's answers with the baseline and stores the result. */
    HandoverComparison.Result compare(Row h, Alloc a) {
        List<HandoverComparison.Item> items = new ArrayList<>();
        Map<Long, Inventory.FurnitureLine> lines = new HashMap<>();
        inventory.furnitureLines(h.roomId()).forEach(l -> lines.put(l.id(), l));
        for (ItemRow i : items(h.id())) {
            Inventory.FurnitureLine line = lines.get(i.itemId());
            items.add(new HandoverComparison.Item(i.itemId(),
                    line == null ? "Item " + i.itemId() : line.type() + " " + line.assetCode(), i.condition(),
                    i.baseline()));
        }
        // The Room may stay empty for days between the inspection and the first arrival: only the hours someone lived
        // there can have used the meters, so the limit counts person-hours since each resident's arrival.
        long hours = personHours(h.roomId(), h.baselineAt(), Instant.now(clock));
        int residents = 1;
        HandoverComparison.Limits limits = new HandoverComparison.Limits(
                parameters.decimalValue("handover.electricity_tolerance"),
                parameters.decimalValue("handover.electricity_per_person_hour"),
                parameters.decimalValue("handover.water_tolerance"),
                parameters.decimalValue("handover.water_per_person_hour"),
                parameters.intValue("handover.major_mismatches"));
        HandoverComparison.Result result = HandoverComparison.compare(items, h.electricity(), h.baselineElectricity(),
                h.water(), h.baselineWater(), hours, residents, limits);
        String note = String.join("\n", result.notes());
        jdbc.sql("UPDATE asg_handover SET comparison = :c, comparison_note = :n, version = version + 1 WHERE id = :id")
                .param("c", result.level()).param("n", note.isEmpty() ? null : note.length() > 500 ? note.substring(0, 500)
                        : note)
                .param("id", h.id()).update();
        return result;
    }

    /**
     * The hours each resident of the Room lived there since the baseline reading, added up (a resident counts from
     * the later of their arrival and the reading). Without a baseline time: 0.
     */
    long personHours(long roomId, Instant baselineAt, Instant now) {
        if (baselineAt == null) {
            return 0;
        }
        List<Long> beds = inventory.bedsOfRoom(roomId).stream().map(Inventory.BedSlot::bedId).toList();
        if (beds.isEmpty()) {
            return 0;
        }
        List<Instant> arrivals = jdbc.sql("""
                SELECT resident_at FROM asg_allocation
                WHERE bed_id IN (:beds) AND status = 'ACTIVE' AND resident_at IS NOT NULL
                """).param("beds", beds).query((rs, i) -> rs.getTimestamp(1).toInstant()).list();
        long total = 0;
        for (Instant arrival : arrivals) {
            Instant from = arrival.isAfter(baselineAt) ? arrival : baselineAt;
            total += Math.max(0, Duration.between(from, now).toHours());
        }
        return total;
    }

    /**
     * Makes the inventory final: each item's final condition is kept (Damaged or Missing ones are recorded as there
     * before the student, and a new damage opens a request), the meters cut the Room's Utility and the student pays
     * Utility from then, and the desk check-in is recorded if it was not.
     *
     * @param source {@code STUDENT} (confirmed as filed), {@code VERIFIED} (checked in the Room) or {@code AUTO}
     * @param by     the Staff member, the student who agreed, or null for the system
     */
    void finalize(Row h, Alloc a, String source, Long by, Instant now) {
        List<ItemRow> items = items(h.id());
        for (ItemRow i : items) {
            String condition = i.finalCondition();
            boolean found = condition != null && (condition.equals("DAMAGED") || condition.equals("MISSING"));
            jdbc.sql("""
                    UPDATE asg_handover_item SET pre_existing = :pre WHERE handover_id = :h AND furniture_item_id = :item
                    """).param("pre", found).param("h", h.id()).param("item", i.itemId()).update();
            boolean wasInUse = i.baseline() == null || i.baseline().equals("GOOD") || i.baseline().equals("WORN");
            if (found && wasInUse) {
                events.publishEvent(new FurnitureFoundDamaged(h.roomId(), i.itemId(), condition,
                        i.verifiedNote() != null ? i.verifiedNote() : i.note(), by != null ? by : a.studentId(),
                        "check-in inventory " + code(h.id())));
            } else if ("WORN".equals(condition) && (i.baseline() == null || "GOOD".equals(i.baseline()))) {
                events.publishEvent(new vn.fpt.campusstay.event.FurnitureDamaged(i.itemId(), "WORN",
                        "Worn in check-in inventory " + code(h.id()), by != null ? by : a.studentId()));
            }
        }
        BigDecimal electricity = source.equals("VERIFIED") && h.verifiedElectricity() != null ? h.verifiedElectricity()
                : source.equals("AUTO") ? null : h.electricity();
        BigDecimal water = source.equals("VERIFIED") && h.verifiedWater() != null ? h.verifiedWater()
                : source.equals("AUTO") ? null : h.water();
        Instant readAt = switch (source) {
            case "VERIFIED" -> h.verifiedAt() != null ? h.verifiedAt() : now;
            case "STUDENT" -> h.submittedAt() != null ? h.submittedAt() : now;
            default -> a.codeReleasedAt() != null ? a.codeReleasedAt() : h.openedAt();
        };
        Inventory.BedSlot bed = inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId());
        if (electricity != null && water != null && bed != null) {
            try {
                billing.recordMeterCutOn(h.roomId(), bed.roomCode(), LocalDate.ofInstant(readAt, TimeConfig.CAMPUS_ZONE),
                        electricity, water, "CHECK_IN", a.id(), by != null ? by : a.studentId());
            } catch (ApiException e) {
                // A later reading of the Room is higher (someone else's cut): the split uses that one.
            }
        }
        jdbc.sql("""
                UPDATE asg_handover SET status = 'FINAL', source = :source, finalized_at = :now, finalized_by = :by,
                       utility_from = :from, version = version + 1
                WHERE id = :id
                """).param("source", source).param("now", Timestamp.from(now)).param("by", by)
                .param("from", Timestamp.from(readAt)).param("id", h.id()).update();
        jdbc.sql("""
                UPDATE asg_allocation SET utility_from = :from, checked_in_at = coalesce(checked_in_at, :now),
                       checked_in_by = coalesce(checked_in_by, :by), version = version + 1
                WHERE id = :id
                """).param("from", Timestamp.from(readAt)).param("now", Timestamp.from(now))
                .param("by", by != null && by != a.studentId() ? by : null).param("id", a.id()).update();
        String label = code(h.id()) + (bed == null ? "" : " · Room " + bed.roomCode());
        if (by == null) {
            audit.record(Actor.SYSTEM, "CHECK_IN_INVENTORY_FINAL", AuditLog.Tone.SUCCESS, "Check-in inventory", h.id(),
                    label, Map.of("source", source));
        } else {
            audit.record("CHECK_IN_INVENTORY_FINAL", AuditLog.Tone.SUCCESS, "Check-in inventory", h.id(), label,
                    Map.of("source", source));
        }
        events.publishEvent(new CheckInInventoryFinal(a.studentId(), bed == null ? "" : bed.roomCode(), readAt));
    }

    static String code(long id) {
        return "HO-" + String.format("%06d", id);
    }

    static Optional<Long> parseCode(String id) {
        String value = id == null ? "" : id.trim().toUpperCase().replaceFirst("^HO-", "");
        if (value.isEmpty() || value.length() > 18 || !value.chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(value));
    }

    private static Row row(ResultSet rs) throws SQLException {
        return new Row(rs.getLong("id"), rs.getLong("allocation_id"), rs.getLong("room_id"), rs.getString("status"),
                rs.getString("source"), instant(rs, "opened_at"), instant(rs, "due_at"), instant(rs, "submitted_at"),
                rs.getBigDecimal("electricity"), rs.getBigDecimal("water"), rs.getBigDecimal("baseline_electricity"),
                rs.getBigDecimal("baseline_water"), instant(rs, "baseline_at"), rs.getString("comparison"),
                rs.getString("comparison_note"), instant(rs, "verify_requested_at"), instant(rs, "visit_at"),
                instant(rs, "verified_at"), rs.getBigDecimal("verified_electricity"), rs.getBigDecimal("verified_water"),
                rs.getString("student_comment"), rs.getString("confirm_reason"), instant(rs, "finalized_at"),
                rs.getObject("finalized_by", Long.class), instant(rs, "utility_from"), rs.getString("cancelled_reason"),
                rs.getString("late_note"), instant(rs, "late_submitted_at"), rs.getInt("reminders_sent"));
    }

    private static Alloc alloc(ResultSet rs) throws SQLException {
        return new Alloc(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("student_id"), rs.getLong("bed_id"),
                rs.getString("renewal"), instant(rs, "code_released_at"), instant(rs, "resident_at"),
                instant(rs, "checked_in_at"), rs.getBoolean("handover_needed"), instant(rs, "eligible_at"));
    }

    static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
