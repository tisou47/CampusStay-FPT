package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.event.CheckOutToAgree;
import vn.fpt.campusstay.event.DamageToAcknowledge;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * The furniture part of a check-out, with the student at the desk. Staff record the condition of each item the
 * student answers for (their Bed's items and the Room's shared items); the charges follow {@link CheckOutCharges}
 * and the student reads them on the app and agrees before Staff complete the check-out. An item the student does not
 * accept goes to a Manager, who keeps or drops it the same day; until then it is not charged. Shared items are
 * charged only for damage the student acknowledged ({@link #claim}). There is no dispute window afterwards.
 */
@Service
public class CheckOutFurnitureService {

    /** A line as screens show it; {@code review}: Pending, Kept or Dropped when a Manager was asked. */
    public record Line(String itemId, String assetCode, String type, String typeVi, String bed, boolean personal,
            String atCheckIn, String atCheckOut, boolean preExisting, long unitPrice, int percent, long amount,
            String source, String note, String review, String reviewNote, String studentReportedCondition,
            String studentReportedNote, Instant studentReportedAt) {
    }

    /** Settlement preview shown to the student when checking and confirming the check-out package. */
    public record SettlementPreview(long held, String periodLabel, long share, long unpaid, long damage, long refund) {
    }

    /**
     * @param total          what is charged now (lines a Manager is reviewing or dropped are left out)
     * @param studentPresent the student is at the desk and must agree
     */
    public record Charges(String allocationId, String room, String bed, List<Line> items, long total,
            boolean studentPresent, Instant agreedAt, boolean saved, List<Claim> claims,
            Map<String, Integer> conditionRates, BigDecimal electricity, BigDecimal water,
            SettlementPreview settlement, CheckInReport checkInReport) {
    }

    /**
     * The student's final check-in inventory (the Final report kept through the stay) the charges are compared with:
     * its code, when it became final and how (Checked in the Room, As filed, Deadline passed); null without one.
     */
    public record CheckInReport(String id, Instant finalizedAt, String source) {
    }

    /** Staff's answer for an item; {@code amount} overrides the computed charge (with a reason). */
    public record Answer(String itemId, String condition, String note, Long amount, String overrideReason,
            Boolean managerReview) {
    }

    public record Claim(String id, String itemId, String assetCode, String type, String condition, String status,
            long amount, Instant dueAt) {
    }

    public record ReviewRow(String allocationId, String itemId, String assetCode, String type, String room,
            String studentName, String condition, long amount, String note) {
    }

    private record Target(long allocationId, long termId, long studentId, long bedId, long roomId, String roomCode,
            String bedLabel, long buildingId, Instant residentAt, String status) {
    }

    private record Saved(long itemId, String condition, String baseline, long amount, Long unitPrice, Integer percent,
            String source, String note, String overrideReason, String review, String reviewNote) {
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final CheckOutCharges charges;
    private final Inventory inventory;
    private final Billing billing;
    private final Parameters parameters;
    private final vn.fpt.campusstay.service.auth.UserDirectory users;
    private final JdbcStays stays;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public CheckOutFurnitureService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope,
            CheckOutCharges charges, Inventory inventory, Billing billing, Parameters parameters,
            vn.fpt.campusstay.service.auth.UserDirectory users, JdbcStays stays, ApplicationEventPublisher events,
            AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.charges = charges;
        this.inventory = inventory;
        this.billing = billing;
        this.parameters = parameters;
        this.users = users;
        this.stays = stays;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- Staff

    @Transactional(readOnly = true)
    public Charges view(String allocationId) {
        currentUser.require(Permission.DESK);
        return view(target(allocationId, false));
    }

    /**
     * Records the furniture of the check-out (a draft until the desk completes it) and, with the student present,
     * asks them to agree on the app. Any change asks for a new agreement.
     */
    @Transactional
    public Charges record(String allocationId, List<Answer> answers, boolean studentPresent, BigDecimal electricity,
            BigDecimal water) {
        AuthenticatedUser me = currentUser.require(Permission.DESK);
        Target t = target(allocationId, true);
        if ("COMPLETED".equals(t.status())) {
            throw ApiException.conflict("ALREADY_CHECKED_OUT", "This student has already checked out.");
        }
        if (electricity != null && water != null) {
            billing.readingProblem(t.roomId(), electricity, water).ifPresent(msg -> {
                throw FieldErrors.single("electricity", msg);
            });
        }
        Map<Long, Answer> byItem = new HashMap<>();
        for (Answer a : answers == null ? List.<Answer>of() : answers) {
            if (a != null) {
                byItem.put(StudentHandoverService.parseItem(a.itemId()), a);
            }
        }
        Map<Long, String> conditions = new HashMap<>();
        byItem.forEach((item, a) -> {
            String c = StudentHandoverService.condition(a.condition());
            if (c != null) {
                conditions.put(item, c);
            }
        });
        List<CheckOutCharges.Line> lines = charges.lines(t.allocationId(), t.termId(), t.roomId(), t.bedId(),
                t.residentAt(), conditions);
        for (Long item : byItem.keySet()) {
            if (lines.stream().noneMatch(l -> l.itemId() == item)) {
                throw FieldErrors.single("items", "Record only the items this student answers for.");
            }
        }
        long checkOutId = checkOutRow(t, me.userId());
        Map<Long, Saved> before = saved(checkOutId);
        jdbc.sql("DELETE FROM asg_check_out_damage WHERE check_out_id = :c").param("c", checkOutId).update();
        long total = 0;
        for (CheckOutCharges.Line l : lines) {
            Answer a = byItem.get(l.itemId());
            long amount = l.amount();
            String source = l.source().equals("NONE") ? null : l.source();
            String reason = null;
            if (a != null && a.amount() != null) {
                reason = a.overrideReason() == null ? "" : a.overrideReason().trim();
                if (reason.isEmpty() || reason.length() > 300) {
                    throw FieldErrors.single("items", "Write why the charge of " + l.assetCode()
                            + " differs from the price list (at most 300 characters).");
                }
                if (a.amount() < 0 || a.amount() > 1_000_000_000) {
                    throw FieldErrors.single("items", "Enter a charge of 0 or more.");
                }
                amount = a.amount();
                source = "OVERRIDE";
            }
            String note = a == null || a.note() == null || a.note().isBlank() ? null : a.note().trim();
            if (note != null && note.length() > 300) {
                throw FieldErrors.single("items", "Keep each note under 300 characters.");
            }
            Saved previous = before.get(l.itemId());
            String review = a != null && Boolean.TRUE.equals(a.managerReview()) && amount > 0 ? "PENDING"
                    : previous != null && previous.review() != null && previous.amount() == amount ? previous.review() : null;
            jdbc.sql("""
                    INSERT INTO asg_check_out_damage (check_out_id, furniture_item_id, amount, note, condition,
                                                      baseline_condition, unit_price, percent, source, override_reason,
                                                      manager_review, review_note)
                    VALUES (:c, :item, :amount, :note, :condition, :baseline, :price, :percent, :source, :reason,
                            :review, :reviewNote)
                    """).param("c", checkOutId).param("item", l.itemId()).param("amount", amount).param("note", note)
                    .param("condition", l.now()).param("baseline", l.start()).param("price", l.unitPrice())
                    .param("percent", l.percent()).param("source", source).param("reason", reason)
                    .param("review", review).param("reviewNote", previous == null ? null : previous.reviewNote())
                    .update();
            if (review == null || review.equals("KEPT")) {
                total += amount;
            }
        }
        boolean allGood = lines.stream().allMatch(l -> "GOOD".equals(l.now()));
        jdbc.sql("""
                UPDATE asg_check_out SET damage_charge = :total, student_present = :present, student_agreed_at = NULL,
                       electricity = coalesce(:electricity, electricity), water = coalesce(:water, water),
                       condition_good = :good, updated_at = :now, version = version + 1
                WHERE id = :id
                """).param("total", total).param("present", studentPresent)
                .param("electricity", electricity).param("water", water).param("good", allGood)
                .param("now", Timestamp.from(Instant.now(clock))).param("id", checkOutId).update();
        audit.record("CHECK_OUT_FURNITURE_RECORDED", AuditLog.Tone.INFO, "Allocation", t.allocationId(),
                "Room " + t.roomCode() + " · Bed " + t.bedLabel(), Map.of("charge", total));
        if (studentPresent) {
            events.publishEvent(new CheckOutToAgree(t.studentId(), t.roomCode(), total));
        }
        return view(t);
    }

    /**
     * Damage to a shared item that Staff attribute to a resident of the Room: charged at check-out only once the
     * student acknowledges it within {@code handover.acknowledge_hours}.
     */
    @Transactional
    public Claim claim(String allocationId, String itemId, String condition, String note) {
        AuthenticatedUser me = currentUser.require(Permission.DESK);
        Target t = target(allocationId, true);
        long item = StudentHandoverService.parseItem(itemId);
        String c = StudentHandoverService.condition(condition);
        if (!"DAMAGED".equals(c) && !"MISSING".equals(c)) {
            throw FieldErrors.single("condition", "Choose Damaged or Missing.");
        }
        Inventory.FurnitureLine line = inventory.furnitureLines(t.roomId()).stream().filter(l -> l.id() == item)
                .findFirst().orElseThrow(() -> FieldErrors.single("itemId", "Choose an item of the student's Room."));
        if (line.personal() && line.bedId() != null) {
            throw FieldErrors.single("itemId", "Personal items are charged at check-out; choose a shared item.");
        }
        String text = note == null || note.isBlank() ? null : note.trim();
        if (text != null && text.length() > 300) {
            throw FieldErrors.single("note", "Keep the note under 300 characters.");
        }
        long amount = charges.claimAmount(t.roomId(), t.termId(), item, c);
        Instant now = Instant.now(clock);
        Instant due = now.plus(Duration.ofHours(parameters.intValue("handover.acknowledge_hours")));
        long id = jdbc.sql("""
                INSERT INTO asg_damage_claim (allocation_id, furniture_item_id, condition, note, amount, created_by,
                                              created_at, due_at)
                VALUES (:a, :item, :c, :note, :amount, :by, :now, :due) RETURNING id
                """).param("a", t.allocationId()).param("item", item).param("c", c).param("note", text)
                .param("amount", amount).param("by", me.userId()).param("now", Timestamp.from(now))
                .param("due", Timestamp.from(due)).query(Long.class).single();
        audit.record("DAMAGE_CLAIM_CREATED", AuditLog.Tone.WARNING, "Allocation", t.allocationId(),
                line.assetCode() + " · Room " + t.roomCode(), Map.of("condition", c, "amount", amount));
        events.publishEvent(new DamageToAcknowledge(t.studentId(), line.type() + " " + line.assetCode(), t.roomCode(),
                StudentHandoverService.label(c), due, amount));
        return new Claim(String.valueOf(id), "furniture-" + item, line.assetCode(), line.type(),
                StudentHandoverService.label(c), "Pending", amount, due);
    }

    // ---------------------------------------------------------------- Managers

    @Transactional(readOnly = true)
    public List<ReviewRow> reviews(String block) {
        currentUser.require(Permission.DESK);
        java.util.Set<Long> buildings = blockScope.resolve(block).ids();
        record Raw(long allocationId, long studentId, long bedId, long termId, long itemId, String condition,
                long amount, String note) {
        }
        List<Raw> raws = jdbc.sql("""
                SELECT c.allocation_id, a.student_id, a.bed_id, a.term_id, d.furniture_item_id, d.condition, d.amount,
                       d.note
                FROM asg_check_out_damage d JOIN asg_check_out c ON c.id = d.check_out_id
                JOIN asg_allocation a ON a.id = c.allocation_id
                WHERE d.manager_review = 'PENDING' ORDER BY c.updated_at, d.furniture_item_id
                """).query((rs, i) -> new Raw(rs.getLong("allocation_id"), rs.getLong("student_id"), rs.getLong("bed_id"),
                        rs.getLong("term_id"), rs.getLong("furniture_item_id"), rs.getString("condition"),
                        rs.getLong("amount"), rs.getString("note")))
                .list();
        List<ReviewRow> rows = new ArrayList<>();
        Map<Long, String> names = users.displayNames(raws.stream().map(Raw::studentId).toList());
        for (Raw r : raws) {
            Inventory.BedSlot bed = inventory.beds(r.termId(), List.of(r.bedId())).get(r.bedId());
            if (bed == null || !buildings.contains(bed.buildingId())) {
                continue;
            }
            Inventory.FurnitureLine line = inventory.furnitureLines(bed.roomId()).stream()
                    .filter(l -> l.id() == r.itemId()).findFirst().orElse(null);
            rows.add(new ReviewRow(String.valueOf(r.allocationId()), "furniture-" + r.itemId(),
                    line == null ? null : line.assetCode(), line == null ? null : line.type(), bed.roomCode(),
                    names.get(r.studentId()), StudentHandoverService.label(r.condition()), r.amount(), r.note()));
        }
        return rows;
    }

    /**
     * A Manager keeps or drops an item the student did not accept. Kept after the check-out was completed, it is
     * invoiced to the student (DAMAGE); dropped, nobody pays.
     */
    @Transactional
    public Charges decide(String allocationId, String itemId, boolean keep, String note) {
        AuthenticatedUser me = currentUser.require(Permission.REVIEW_CHECK_OUT_CHARGES);
        Target t = target(allocationId, true);
        long item = StudentHandoverService.parseItem(itemId);
        String text = note == null ? "" : note.trim();
        if (text.isEmpty() || text.length() > 300) {
            throw FieldErrors.single("note", "Write the reason of your decision (at most 300 characters).");
        }
        long checkOutId = jdbc.sql("SELECT id FROM asg_check_out WHERE allocation_id = :a").param("a", t.allocationId())
                .query(Long.class).optional().orElseThrow(() -> ApiException.notFound("No check-out to review."));
        Saved line = saved(checkOutId).get(item);
        if (line == null || !"PENDING".equals(line.review())) {
            throw ApiException.conflict("NOTHING_TO_REVIEW", "This item is not waiting for a Manager.");
        }
        Instant now = Instant.now(clock);
        jdbc.sql("""
                UPDATE asg_check_out_damage SET manager_review = :r, reviewed_by = :by, reviewed_at = :now,
                       review_note = :note
                WHERE check_out_id = :c AND furniture_item_id = :item
                """).param("r", keep ? "KEPT" : "DROPPED").param("by", me.userId()).param("now", Timestamp.from(now))
                .param("note", text).param("c", checkOutId).param("item", item).update();
        if (keep) {
            if ("COMPLETED".equals(t.status())) {
                billing.issueCharge(new Billing.ChargeRequest(t.termId(), t.studentId(), t.allocationId(),
                        t.buildingId(), "DAMAGE", "Furniture charge · Room " + t.roomCode(), line.amount(),
                        List.of(new Billing.ChargeLine("Furniture item " + item, line.amount())),
                        now.plus(Duration.ofDays(7)), "CHECK_OUT-" + t.allocationId() + "-" + item));
            } else {
                jdbc.sql("UPDATE asg_check_out SET damage_charge = damage_charge + :a WHERE id = :id")
                        .param("a", line.amount()).param("id", checkOutId).update();
            }
        }
        audit.record(keep ? "CHECK_OUT_CHARGE_KEPT" : "CHECK_OUT_CHARGE_DROPPED", AuditLog.Tone.INFO, "Allocation",
                t.allocationId(), "Room " + t.roomCode(), Map.of("item", item, "amount", line.amount(), "note", text));
        return view(t);
    }

    // ---------------------------------------------------------------- student

    /** The student's own check-out charges (null when Staff recorded none yet) and shared damage to acknowledge. */
    @Transactional(readOnly = true)
    public Charges mine() {
        long me = currentUser.require(Role.STUDENT).userId();
        Optional<Long> allocation = jdbc.sql("""
                SELECT a.id FROM asg_allocation a LEFT JOIN asg_check_out c ON c.allocation_id = a.id
                WHERE a.student_id = :s AND (a.status = 'ACTIVE' OR c.status = 'COMPLETED')
                ORDER BY (c.id IS NOT NULL) DESC, a.id DESC LIMIT 1
                """).param("s", me).query(Long.class).optional();
        return allocation.map(id -> view(targetOf(id))).orElse(null);
    }

    @Transactional
    public Charges agree() {
        long me = currentUser.require(Role.STUDENT).userId();
        Long checkOutId = jdbc.sql("""
                SELECT c.id FROM asg_check_out c JOIN asg_allocation a ON a.id = c.allocation_id
                WHERE a.student_id = :s AND c.status <> 'COMPLETED' AND c.student_present
                ORDER BY c.id DESC LIMIT 1 FOR UPDATE OF c
                """).param("s", me).query(Long.class).optional()
                .orElseThrow(() -> ApiException.conflict("NOTHING_TO_AGREE", "Staff have not recorded your check-out yet."));
        jdbc.sql("UPDATE asg_check_out SET student_agreed_at = :now, version = version + 1 WHERE id = :id")
                .param("now", Timestamp.from(Instant.now(clock))).param("id", checkOutId).update();
        return mine();
    }

    /** The student confirms (or declines) damage to a shared item Staff attributed to them. */
    @Transactional
    public Charges answerClaim(String claimId, boolean acknowledge) {
        long me = currentUser.require(Role.STUDENT).userId();
        long id;
        try {
            id = Long.parseLong(claimId.trim());
        } catch (RuntimeException e) {
            throw ApiException.notFound("This damage record does not exist.");
        }
        int updated = jdbc.sql("""
                UPDATE asg_damage_claim c SET status = :s, answered_at = :now
                FROM asg_allocation a
                WHERE c.id = :id AND a.id = c.allocation_id AND a.student_id = :me AND c.status = 'PENDING'
                  AND c.due_at > :now
                """).param("s", acknowledge ? "ACKNOWLEDGED" : "DECLINED").param("now", Timestamp.from(Instant.now(clock)))
                .param("id", id).param("me", me).update();
        if (updated == 0) {
            throw ApiException.notFound("This damage record does not exist or can no longer be answered.");
        }
        return mine();
    }

    /** Claims not answered by their deadline are not charged. @return how many expired */
    @Transactional
    public int expireClaims() {
        return jdbc.sql("UPDATE asg_damage_claim SET status = 'EXPIRED' WHERE status = 'PENDING' AND due_at <= :now")
                .param("now", Timestamp.from(Instant.now(clock))).update();
    }

    // ---------------------------------------------------------------- helpers

    private Charges view(Target t) {
        Optional<Long> checkOutId = jdbc.sql("SELECT id FROM asg_check_out WHERE allocation_id = :a")
                .param("a", t.allocationId()).query(Long.class).optional();
        Map<Long, Saved> saved = checkOutId.map(this::saved).orElse(Map.of());
        boolean recorded = saved.values().stream().anyMatch(s -> s.condition() != null);
        Map<Long, String> answers = new HashMap<>();
        saved.forEach((item, s) -> {
            if (s.condition() != null) {
                answers.put(item, s.condition());
            }
        });
        List<CheckOutCharges.Line> lines = charges.lines(t.allocationId(), t.termId(), t.roomId(), t.bedId(),
                t.residentAt(), answers);
        record StudentReport(String condition, String note, Instant at) {
        }
        Map<Long, StudentReport> studentReports = new HashMap<>();
        jdbc.sql("""
                SELECT furniture_item_id, condition, note, updated_at
                FROM asg_furniture_report WHERE allocation_id = :a
                """).param("a", t.allocationId())
                .query((rs, i) -> Map.entry(rs.getLong("furniture_item_id"),
                        new StudentReport(rs.getString("condition"), rs.getString("note"),
                                rs.getTimestamp("updated_at").toInstant())))
                .list().forEach(e -> studentReports.put(e.getKey(), e.getValue()));
        List<Line> items = new ArrayList<>();
        long total = 0;
        for (CheckOutCharges.Line l : lines) {
            Saved s = saved.get(l.itemId());
            long amount = s != null && recorded ? s.amount() : l.amount();
            String review = s == null || s.review() == null ? null : switch (s.review()) {
                case "PENDING" -> "Pending";
                case "KEPT" -> "Kept";
                default -> "Dropped";
            };
            if (review == null || review.equals("Kept")) {
                total += amount;
            }
            StudentReport rep = studentReports.get(l.itemId());
            items.add(new Line("furniture-" + l.itemId(), l.assetCode(), l.type(), l.typeVi(), l.bed(), l.personal(),
                    StudentHandoverService.label(l.start()), StudentHandoverService.label(l.now()), l.preExisting(),
                    l.unitPrice(), l.percent(), amount,
                    s != null && "OVERRIDE".equals(s.source()) ? "Override" : l.source().equals("ACKNOWLEDGED")
                            ? "Acknowledged" : l.personal() ? "Personal" : "Shared",
                    s != null ? (s.overrideReason() != null ? s.overrideReason() : s.note()) : l.note(), review,
                    s == null ? null : s.reviewNote(),
                    rep == null ? null : StudentHandoverService.label(rep.condition()),
                    rep == null ? null : rep.note(), rep == null ? null : rep.at()));
        }
        record Meta(Boolean present, Instant agreed, BigDecimal electricity, BigDecimal water, String status,
                Long held, String period, Long share, Long unpaid, Long damage, Long settled) {
        }
        Meta meta = checkOutId.map(id -> jdbc.sql("""
                SELECT student_present, student_agreed_at, electricity, water, status, deposit_held, share_period,
                       utility_share, unpaid_utility, damage_charge, settled_amount
                FROM asg_check_out WHERE id = :id
                """)
                .param("id", id).query((rs, i) -> new Meta(rs.getObject("student_present", Boolean.class),
                        HandoverCore.instant(rs, "student_agreed_at"), rs.getBigDecimal("electricity"),
                        rs.getBigDecimal("water"), rs.getString("status"), rs.getObject("deposit_held", Long.class),
                        rs.getString("share_period"), rs.getObject("utility_share", Long.class),
                        rs.getObject("unpaid_utility", Long.class), rs.getObject("damage_charge", Long.class),
                        rs.getObject("settled_amount", Long.class))).single())
                .orElse(new Meta(null, null, null, null, null, null, null, null, null, null, null));
        List<Claim> claims = jdbc.sql("""
                SELECT id, furniture_item_id, condition, status, amount, due_at FROM asg_damage_claim
                WHERE allocation_id = :a ORDER BY id
                """).param("a", t.allocationId()).query((rs, i) -> {
                    long item = rs.getLong("furniture_item_id");
                    Inventory.FurnitureLine line = inventory.furnitureLines(t.roomId()).stream().filter(l -> l.id() == item)
                            .findFirst().orElse(null);
                    String status = rs.getString("status");
                    return new Claim(String.valueOf(rs.getLong("id")), "furniture-" + item,
                            line == null ? null : line.assetCode(), line == null ? null : line.type(),
                            StudentHandoverService.label(rs.getString("condition")),
                            status.charAt(0) + status.substring(1).toLowerCase(), rs.getLong("amount"),
                            rs.getTimestamp("due_at").toInstant());
                }).list();
        Map<String, Integer> loss = inventory.conditionLoss();
        Map<String, Integer> conditionRates = new java.util.LinkedHashMap<>();
        conditionRates.put("Good", loss.getOrDefault("GOOD", 0));
        conditionRates.put("Worn", loss.getOrDefault("WORN", 25));
        conditionRates.put("Damaged", loss.getOrDefault("DAMAGED", 50));
        conditionRates.put("Missing", loss.getOrDefault("MISSING", 100));
        SettlementPreview settlement = "COMPLETED".equals(meta.status())
                ? new SettlementPreview(meta.held() == null ? 0 : meta.held(), meta.period(),
                        meta.share() == null ? 0 : meta.share(), meta.unpaid() == null ? 0 : meta.unpaid(),
                        meta.damage() == null ? total : meta.damage(), meta.settled() == null ? 0 : meta.settled())
                : estimateSettlement(t, meta.electricity(), meta.water(), total);
        return new Charges(String.valueOf(t.allocationId()), t.roomCode(), t.bedLabel(), items, total,
                Boolean.TRUE.equals(meta.present()), meta.agreed(), recorded, claims, conditionRates,
                meta.electricity(), meta.water(), settlement, checkInReport(t.allocationId()));
    }

    private CheckInReport checkInReport(long allocationId) {
        return jdbc.sql("""
                SELECT id, finalized_at, source FROM asg_handover
                WHERE allocation_id = :a AND status = 'FINAL' ORDER BY id DESC LIMIT 1
                """).param("a", allocationId)
                .query((rs, i) -> new CheckInReport(HandoverCore.code(rs.getLong("id")),
                        rs.getTimestamp("finalized_at") == null ? null : rs.getTimestamp("finalized_at").toInstant(),
                        switch (String.valueOf(rs.getString("source"))) {
                            case "AUTO" -> "Deadline passed";
                            case "VERIFIED" -> "Checked in the Room";
                            default -> "As filed";
                        }))
                .optional().orElse(null);
    }

    private SettlementPreview estimateSettlement(Target t, BigDecimal electricity, BigDecimal water, long damage) {
        List<Long> beds = inventory.bedsOfRoom(t.roomId()).stream().map(Inventory.BedSlot::bedId).toList();
        int residents = beds.isEmpty() ? 1 : Math.max(1, jdbc.sql("""
                SELECT count(*) FROM asg_allocation
                WHERE term_id = :term AND status = 'ACTIVE' AND resident_at IS NOT NULL AND bed_id IN (:beds)
                """).param("term", t.termId()).param("beds", beds).query(Integer.class).single());
        List<Long> stayIds = stays.allocationsOfStay(t.allocationId());
        Billing.Settlement s;
        try {
            s = billing.estimateCheckOut(new Billing.SettlementRequest(t.termId(), t.studentId(), t.allocationId(),
                    stayIds, t.roomId(), t.roomCode(), t.buildingId(), electricity, water, damage, residents));
        } catch (ApiException e) {
            s = billing.estimateCheckOut(new Billing.SettlementRequest(t.termId(), t.studentId(), t.allocationId(),
                    stayIds, t.roomId(), t.roomCode(), t.buildingId(), null, null, damage, residents));
        }
        return new SettlementPreview(s.held(), s.periodLabel(), s.share(), s.unpaid(), s.damage(), s.refund());
    }

    private Map<Long, Saved> saved(long checkOutId) {
        Map<Long, Saved> result = new HashMap<>();
        jdbc.sql("SELECT * FROM asg_check_out_damage WHERE check_out_id = :c").param("c", checkOutId)
                .query((rs, i) -> new Saved(rs.getLong("furniture_item_id"), rs.getString("condition"),
                        rs.getString("baseline_condition"), rs.getLong("amount"), rs.getObject("unit_price", Long.class),
                        rs.getObject("percent", Integer.class), rs.getString("source"), rs.getString("note"),
                        rs.getString("override_reason"), rs.getString("manager_review"), rs.getString("review_note")))
                .list().forEach(s -> result.put(s.itemId(), s));
        return result;
    }

    /** The check-out record of the Allocation, created as a draft when Staff start with the furniture. */
    private long checkOutRow(Target t, long by) {
        return jdbc.sql("""
                INSERT INTO asg_check_out (allocation_id, reason, status, draft_by, updated_at)
                VALUES (:a, 'TERM_END', 'DRAFT', :by, :now)
                ON CONFLICT (allocation_id) DO UPDATE SET updated_at = EXCLUDED.updated_at
                RETURNING id
                """).param("a", t.allocationId()).param("by", by).param("now", Timestamp.from(Instant.now(clock)))
                .query(Long.class).single();
    }

    private Target target(String allocationId, boolean lock) {
        long id;
        try {
            id = Long.parseLong(allocationId == null ? "" : allocationId.trim());
        } catch (NumberFormatException e) {
            throw ApiException.notFound("This Allocation does not exist.");
        }
        if (lock) {
            jdbc.sql("SELECT id FROM asg_allocation WHERE id = :id FOR UPDATE").param("id", id).query(Long.class)
                    .optional();
        }
        Target t = targetOf(id);
        blockScope.check(t.buildingId());
        return t;
    }

    private Target targetOf(long id) {
        record Raw(long id, long termId, long studentId, long bedId, Instant residentAt, String status) {
        }
        Raw raw = jdbc.sql("""
                SELECT a.id, a.term_id, a.student_id, a.bed_id, a.resident_at, c.status
                FROM asg_allocation a LEFT JOIN asg_check_out c ON c.allocation_id = a.id WHERE a.id = :id
                """).param("id", id).query((rs, i) -> new Raw(rs.getLong("id"), rs.getLong("term_id"),
                        rs.getLong("student_id"), rs.getLong("bed_id"), HandoverCore.instant(rs, "resident_at"),
                        rs.getString("status")))
                .optional().orElseThrow(() -> ApiException.notFound("This Allocation does not exist."));
        Inventory.BedSlot bed = inventory.beds(raw.termId(), List.of(raw.bedId())).get(raw.bedId());
        if (bed == null) {
            throw ApiException.notFound("This Allocation does not exist.");
        }
        return new Target(raw.id(), raw.termId(), raw.studentId(), raw.bedId(), bed.roomId(), bed.roomCode(),
                bed.bedLabel(), bed.buildingId(), raw.residentAt(), raw.status());
    }
}
