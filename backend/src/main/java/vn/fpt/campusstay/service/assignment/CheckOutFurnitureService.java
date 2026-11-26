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
import vn.fpt.campusstay.common.file.FileLinks;
import vn.fpt.campusstay.common.file.FileStore;
import vn.fpt.campusstay.event.CheckOutDisputeAnswered;
import vn.fpt.campusstay.event.CheckOutDisputed;
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
 * charged for damage the student acknowledged ({@link #claim}); damage Staff record on a shared item at the check-out
 * is split evenly among the Room's residents, and the roommates' shares are invoiced when the check-out is completed
 * ({@link #chargeRoommates}). Two ways to disagree, at two moments: the leaving student disagrees with the charges on
 * the app before agreeing ({@link #disputeMine}, answered by the Staff who recorded them, {@link #answerDispute}); a
 * roommate declines a shared-item share attributed to them ({@link #answerClaim}), which a Manager then keeps or drops
 * ({@link #decideClaim}). There is no dispute window after the check-out is completed.
 */
@Service
public class CheckOutFurnitureService {

    /**
     * A line as screens show it; {@code review}: Pending, Kept or Dropped when a Manager was asked. A shared item's
     * damage split among the Room's residents: {@code sharedWith} residents (1: not split), {@code fullAmount} the
     * whole charge, {@code amount} the leaver's share.
     */
    public record Line(String itemId, String assetCode, String type, String typeVi, String bed, boolean personal,
            String atCheckIn, String atCheckOut, boolean preExisting, long unitPrice, int percent, long amount,
            String source, String note, String review, String reviewNote, String studentReportedCondition,
            String studentReportedNote, Instant studentReportedAt, int sharedWith, long fullAmount,
            List<String> studentReportedPhotos) {
    }

    /** Settlement preview shown to the student when checking and confirming the check-out package. */
    public record SettlementPreview(long held, String periodLabel, long share, long unpaid, long damage, long refund) {
    }

    /**
     * @param total          what is charged now (lines a Manager is reviewing or dropped are left out)
     * @param studentPresent the student is at the desk and must agree
     * @param residents      the Room's residents a shared item's damage is split among (the student and roommates)
     */
    public record Charges(String allocationId, String room, String bed, List<Line> items, long total,
            boolean studentPresent, Instant agreedAt, boolean saved, List<Claim> claims,
            Map<String, Integer> conditionRates, List<Inventory.ConditionLevel> conditionLevels,
            BigDecimal electricity, BigDecimal water, SettlementPreview settlement, CheckInReport checkInReport,
            int residents, StudentMeters studentMeters, Instant declarationSubmittedAt, Dispute dispute,
            Instant checkedOutAt) {
    }

    /**
     * The student's latest disagreement with the charges: {@code status} Open (Staff check again) or Answered; the
     * items they named ({@code furniture-<id>}), why, and Staff's answer.
     */
    public record Dispute(String id, String status, List<String> itemIds, String reason, Instant createdAt,
            String answer, Instant answeredAt) {
    }

    /** The meter readings the student entered before check-out, with photos of the meters; null fields when none. */
    public record StudentMeters(BigDecimal electricity, BigDecimal water, Instant updatedAt, List<MeterPhoto> photos) {
    }

    public record MeterPhoto(String id, String url) {
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

    /** @param claimId set for shared damage the student declined (decided at {@link #decideClaim}), else null */
    public record ReviewRow(String allocationId, String itemId, String assetCode, String type, String room,
            String studentName, String condition, long amount, String note, String claimId) {
    }

    private record Target(long allocationId, long termId, long studentId, long bedId, long roomId, String roomCode,
            String bedLabel, long buildingId, Instant residentAt, String status) {
    }

    private record Saved(long itemId, String condition, String baseline, long amount, Long unitPrice, Integer percent,
            String source, String note, String overrideReason, String review, String reviewNote, Integer sharedWith,
            Long fullAmount) {
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
    private final FileLinks links;
    private final FileStore files;

    public CheckOutFurnitureService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope,
            CheckOutCharges charges, Inventory inventory, Billing billing, Parameters parameters,
            vn.fpt.campusstay.service.auth.UserDirectory users, JdbcStays stays, ApplicationEventPublisher events,
            AuditLog audit, Clock clock, FileLinks links, FileStore files) {
        this.links = links;
        this.files = files;
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
            // A shared item's damage split among the residents (not when Staff override the charge).
            boolean split = !"OVERRIDE".equals(source) && l.sharedWith() > 1;
            jdbc.sql("""
                    INSERT INTO asg_check_out_damage (check_out_id, furniture_item_id, amount, note, condition,
                                                      baseline_condition, unit_price, percent, source, override_reason,
                                                      manager_review, review_note, shared_with, full_amount)
                    VALUES (:c, :item, :amount, :note, :condition, :baseline, :price, :percent, :source, :reason,
                            :review, :reviewNote, :shared, :full)
                    """).param("c", checkOutId).param("item", l.itemId()).param("amount", amount).param("note", note)
                    .param("condition", l.now()).param("baseline", l.start()).param("price", l.unitPrice())
                    .param("percent", l.percent()).param("source", source).param("reason", reason)
                    .param("review", review).param("reviewNote", previous == null ? null : previous.reviewNote())
                    .param("shared", split ? l.sharedWith() : null).param("full", split ? l.fullAmount() : null)
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
        // The student agrees (or disagrees) on the app, at the desk or later.
        events.publishEvent(new CheckOutToAgree(t.studentId(), t.roomCode(), total));
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

    /**
     * Invoices each roommate their share of the shared items' damage split at this check-out: one DAMAGE Invoice per
     * roommate and item, due in {@code checkout.damage_due_days} like a charge a Manager keeps after the check-out, which tells them on the
     * app; unpaid, it becomes Overdue like every other charge. Called when the check-out is completed (lines a Manager
     * has not kept are left out) and when a Manager keeps a line afterwards ({@code onlyItem}).
     *
     * @return the Invoices issued
     */
    @Transactional
    public int chargeRoommates(long allocationId, Long onlyItem) {
        Target t = targetOf(allocationId);
        record Split(long itemId, int sharedWith, long full, String condition, int percent, String note) {
        }
        List<Split> splits = jdbc.sql("""
                SELECT d.furniture_item_id, d.shared_with, d.full_amount, d.condition, d.percent, d.note
                FROM asg_check_out_damage d JOIN asg_check_out c ON c.id = d.check_out_id
                WHERE c.allocation_id = :a AND d.shared_with > 1 AND d.full_amount > 0
                  AND coalesce(d.source, '') <> 'OVERRIDE'
                  AND (d.manager_review IS NULL OR d.manager_review = 'KEPT')
                  AND (CAST(:item AS BIGINT) IS NULL OR d.furniture_item_id = :item)
                ORDER BY d.furniture_item_id
                """).param("a", allocationId).param("item", onlyItem)
                .query((rs, i) -> new Split(rs.getLong("furniture_item_id"), rs.getInt("shared_with"),
                        rs.getLong("full_amount"), rs.getString("condition"), rs.getInt("percent"),
                        rs.getString("note")))
                .list();
        if (splits.isEmpty()) {
            return 0;
        }
        record Roommate(long allocationId, long studentId) {
        }
        Instant checkedOutAt = jdbc.sql("""
                SELECT completed_at FROM asg_check_out WHERE allocation_id = :a AND completed_at IS NOT NULL
                ORDER BY completed_at DESC LIMIT 1
                """).param("a", allocationId).query(java.sql.Timestamp.class).optional().map(java.sql.Timestamp::toInstant)
                .orElse(Instant.now(clock));
        List<Long> roommateIds = charges.roommatesAt(allocationId, t.termId(), t.roomId(), checkedOutAt);
        List<Roommate> roommates = roommateIds.isEmpty() ? List.of() : jdbc.sql("""
                SELECT id, student_id FROM asg_allocation WHERE id IN (:ids) ORDER BY id
                """).param("ids", roommateIds)
                .query((rs, i) -> new Roommate(rs.getLong("id"), rs.getLong("student_id"))).list();
        Map<Long, Inventory.FurnitureLine> furniture = new HashMap<>();
        inventory.furnitureLines(t.roomId()).forEach(l -> furniture.put(l.id(), l));
        Instant now = Instant.now(clock);
        int days = parameters.intValue("checkout.damage_due_days"); // as a charge a Manager keeps (decide)
        int issued = 0;
        for (Split split : splits) {
            long share = CheckOutCharges.roommateShare(split.full(), split.sharedWith());
            if (share <= 0) {
                continue;
            }
            Inventory.FurnitureLine line = furniture.get(split.itemId());
            String item = line == null ? "Furniture item " + split.itemId() : line.type() + " " + line.assetCode();
            String condLabel = StudentHandoverService.label(split.condition());
            String fullFormatted = java.text.NumberFormat.getIntegerInstance(java.util.Locale.of("vi", "VN"))
                    .format(split.full()) + " ₫";
            String detail = item + " · " + condLabel
                    + (split.percent() > 0 ? " (" + split.percent() + "%)" : "")
                    + " · " + fullFormatted + " ÷ " + split.sharedWith() + " residents"
                    + (split.note() != null && !split.note().isBlank() ? " · " + split.note().trim() : "");
            for (Roommate r : roommates) {
                billing.issueCharge(new Billing.ChargeRequest(t.termId(), r.studentId(), r.allocationId(), t.buildingId(),
                        "DAMAGE", "Shared furniture damage · Room " + t.roomCode(), share,
                        List.of(new Billing.ChargeLine(detail, share)),
                        now.plus(Duration.ofDays(days)),
                        "SHARED-" + allocationId + "-" + split.itemId() + "-" + r.allocationId()));
                issued++;
            }
            audit.record("SHARED_DAMAGE_SPLIT", AuditLog.Tone.INFO, "Allocation", allocationId,
                    item + " · Room " + t.roomCode(), Map.of("full", split.full(), "residents", split.sharedWith(),
                            "share", share, "roommates", roommates.size()));
        }
        return issued;
    }

    // ---------------------------------------------------------------- Managers

    @Transactional(readOnly = true)
    public List<ReviewRow> reviews(String block) {
        currentUser.require(Permission.DESK);
        java.util.Set<Long> buildings = blockScope.resolve(block).ids();
        record Raw(long allocationId, long studentId, long bedId, long termId, long itemId, String condition,
                long amount, String note, Long claimId) {
        }
        List<Raw> raws = jdbc.sql("""
                SELECT c.allocation_id, a.student_id, a.bed_id, a.term_id, d.furniture_item_id, d.condition, d.amount,
                       d.note, NULL::bigint AS claim_id, c.updated_at AS waiting_since
                FROM asg_check_out_damage d JOIN asg_check_out c ON c.id = d.check_out_id
                JOIN asg_allocation a ON a.id = c.allocation_id
                WHERE d.manager_review = 'PENDING'
                UNION ALL
                SELECT k.allocation_id, a.student_id, a.bed_id, a.term_id, k.furniture_item_id, k.condition, k.amount,
                       k.note, k.id, k.answered_at
                FROM asg_damage_claim k JOIN asg_allocation a ON a.id = k.allocation_id
                WHERE k.status = 'DECLINED' AND k.manager_review IS NULL
                ORDER BY waiting_since, furniture_item_id
                """).query((rs, i) -> new Raw(rs.getLong("allocation_id"), rs.getLong("student_id"), rs.getLong("bed_id"),
                        rs.getLong("term_id"), rs.getLong("furniture_item_id"), rs.getString("condition"),
                        rs.getLong("amount"), rs.getString("note"), rs.getObject("claim_id", Long.class)))
                .list();
        List<ReviewRow> rows = new ArrayList<>();
        Map<Long, String> names = users.displayNames(raws.stream().map(Raw::studentId).toList());
        // One Bed lookup per Term and one furniture list per Room (BE-ASG-18), not one of each per line.
        Map<Long, Map<Long, Inventory.BedSlot>> bedsByTerm = new HashMap<>();
        raws.stream().collect(java.util.stream.Collectors.groupingBy(Raw::termId,
                java.util.stream.Collectors.mapping(Raw::bedId, java.util.stream.Collectors.toSet())))
                .forEach((term, ids) -> bedsByTerm.put(term, inventory.beds(term, ids)));
        Map<Long, List<Inventory.FurnitureLine>> linesByRoom = new HashMap<>();
        for (Raw r : raws) {
            Inventory.BedSlot bed = bedsByTerm.get(r.termId()).get(r.bedId());
            if (bed == null || !buildings.contains(bed.buildingId())) {
                continue;
            }
            Inventory.FurnitureLine line = linesByRoom.computeIfAbsent(bed.roomId(), inventory::furnitureLines).stream()
                    .filter(l -> l.id() == r.itemId()).findFirst().orElse(null);
            rows.add(new ReviewRow(String.valueOf(r.allocationId()), "furniture-" + r.itemId(),
                    line == null ? null : line.assetCode(), line == null ? null : line.type(), bed.roomCode(),
                    names.get(r.studentId()), StudentHandoverService.label(r.condition()), r.amount(), r.note(),
                    r.claimId() == null ? null : String.valueOf(r.claimId())));
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
                        now.plus(Duration.ofDays(parameters.intValue("checkout.damage_due_days"))),
                        "CHECK_OUT-" + t.allocationId() + "-" + item));
                chargeRoommates(t.allocationId(), item);
            } else {
                jdbc.sql("UPDATE asg_check_out SET damage_charge = damage_charge + :a WHERE id = :id")
                        .param("a", line.amount()).param("id", checkOutId).update();
            }
        }
        audit.record(keep ? "CHECK_OUT_CHARGE_KEPT" : "CHECK_OUT_CHARGE_DROPPED", AuditLog.Tone.INFO, "Allocation",
                t.allocationId(), "Room " + t.roomCode(), Map.of("item", item, "amount", line.amount(), "note", text));
        return view(t);
    }

    /**
     * A Manager decides shared damage the student declined (owner decision 25/11/2026): kept, it is charged as if
     * acknowledged (invoiced at once when the check-out is already completed); dropped, nobody pays.
     */
    @Transactional
    public Charges decideClaim(String claimId, boolean keep, String note) {
        AuthenticatedUser me = currentUser.require(Permission.REVIEW_CHECK_OUT_CHARGES);
        long id;
        try {
            id = Long.parseLong(claimId == null ? "" : claimId.trim());
        } catch (NumberFormatException e) {
            throw ApiException.notFound("This damage record does not exist.");
        }
        String text = note == null ? "" : note.trim();
        if (text.isEmpty() || text.length() > 300) {
            throw FieldErrors.single("note", "Write the reason of your decision (at most 300 characters).");
        }
        record Row(long allocationId, long itemId, long amount, String status, String review) {
        }
        Row row = jdbc.sql("""
                SELECT allocation_id, furniture_item_id, amount, status, manager_review FROM asg_damage_claim
                WHERE id = :id FOR UPDATE
                """).param("id", id).query((rs, i) -> new Row(rs.getLong("allocation_id"), rs.getLong("furniture_item_id"),
                        rs.getLong("amount"), rs.getString("status"), rs.getString("manager_review")))
                .optional().orElseThrow(() -> ApiException.notFound("This damage record does not exist."));
        Target t = target(String.valueOf(row.allocationId()), true);
        if (!"DECLINED".equals(row.status()) || row.review() != null) {
            throw ApiException.conflict("NOTHING_TO_REVIEW", "This item is not waiting for a Manager.");
        }
        Instant now = Instant.now(clock);
        jdbc.sql("""
                UPDATE asg_damage_claim SET manager_review = :r, reviewed_by = :by, reviewed_at = :now, review_note = :note
                WHERE id = :id
                """).param("r", keep ? "KEPT" : "DROPPED").param("by", me.userId()).param("now", Timestamp.from(now))
                .param("note", text).param("id", id).update();
        if (keep) {
            if ("COMPLETED".equals(t.status())) {
                billing.issueCharge(new Billing.ChargeRequest(t.termId(), t.studentId(), t.allocationId(),
                        t.buildingId(), "DAMAGE", "Shared furniture damage · Room " + t.roomCode(), row.amount(),
                        List.of(new Billing.ChargeLine("Furniture item " + row.itemId(), row.amount())),
                        now.plus(Duration.ofDays(parameters.intValue("checkout.damage_due_days"))), "CLAIM-" + id));
            } else {
                // A check-out already drafted counts it now; one recorded later reads the kept claim (CheckOutCharges).
                jdbc.sql("UPDATE asg_check_out SET damage_charge = damage_charge + :a WHERE allocation_id = :al")
                        .param("a", row.amount()).param("al", t.allocationId()).update();
            }
        }
        audit.record(keep ? "DAMAGE_CLAIM_KEPT" : "DAMAGE_CLAIM_DROPPED", AuditLog.Tone.INFO, "Allocation",
                t.allocationId(), "Room " + t.roomCode(), Map.of("claim", id, "amount", row.amount(), "note", text));
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
                ORDER BY (a.status = 'ACTIVE' AND c.id IS NOT NULL) DESC, (a.status = 'ACTIVE') DESC, a.id DESC LIMIT 1
                """).param("s", me).query(Long.class).optional();
        // the current stay before an older completed check-out (BE-ASG-19)
        return allocation.map(id -> view(targetOf(id))).orElse(null);
    }

    /** The student enters the Room's meter readings before checking out (until the check-out is completed). */
    @Transactional
    public Charges saveMyMeters(BigDecimal electricity, BigDecimal water) {
        long allocationId = myOpenAllocation();
        notSubmitted(allocationId);
        FieldErrors errors = new FieldErrors();
        errors.check(electricity == null || electricity.signum() >= 0, "electricity", "Enter a reading of 0 or more.");
        errors.check(water == null || water.signum() >= 0, "water", "Enter a reading of 0 or more.");
        errors.check(!parameters.boolValue("checkout.photos_required") || jdbc.sql("""
                SELECT count(*) FROM asg_furniture_report_photo WHERE allocation_id = :a AND furniture_item_id IS NULL
                """).param("a", allocationId).query(Long.class).single() > 0, "photo", "Add a photo of the meters.");
        errors.throwIfAny();
        jdbc.sql("""
                INSERT INTO asg_check_out_meter_report (allocation_id, electricity, water, updated_at)
                VALUES (:a, :e, :w, :now)
                ON CONFLICT (allocation_id) DO UPDATE SET
                    electricity = EXCLUDED.electricity, water = EXCLUDED.water, updated_at = EXCLUDED.updated_at
                """).param("a", allocationId).param("e", electricity).param("w", water)
                .param("now", Timestamp.from(Instant.now(clock))).update();
        return mine();
    }

    /** Adds a photo of the meters to the student's check-out readings. */
    @Transactional
    public MeterPhoto addMyMeterPhoto(String fileName, byte[] bytes) {
        long allocationId = myOpenAllocation();
        notSubmitted(allocationId);
        long already = jdbc.sql("""
                SELECT count(*) FROM asg_furniture_report_photo WHERE allocation_id = :a AND furniture_item_id IS NULL
                """).param("a", allocationId).query(Long.class).single();
        int max = parameters.intValue("handover.max_photos");
        if (already >= max) {
            throw FieldErrors.single("photo", "Add at most " + max + " photos per item.");
        }
        if (bytes == null || bytes.length == 0) {
            throw FieldErrors.single("photo", "Choose a photo.");
        }
        long me = currentUser.require(Role.STUDENT).userId();
        FileStore.StoredFile file = files.store("asg", fileName, bytes, FileStore.IMAGES, me);
        long id = jdbc.sql("""
                INSERT INTO asg_furniture_report_photo (allocation_id, furniture_item_id, file_id, taken_by, created_at)
                VALUES (:a, NULL, :f, :u, :now) RETURNING id
                """).param("a", allocationId).param("f", file.id()).param("u", me)
                .param("now", Timestamp.from(Instant.now(clock))).query(Long.class).single();
        return new MeterPhoto(String.valueOf(id), links.link(file.id()));
    }

    /** Removes a photo of the meters from the student's check-out readings. */
    @Transactional
    public void removeMyMeterPhoto(String photoId) {
        long allocationId = myOpenAllocation();
        notSubmitted(allocationId);
        long id;
        try {
            id = Long.parseLong(photoId == null ? "" : photoId.trim());
        } catch (NumberFormatException e) {
            throw ApiException.notFound("This photo does not exist.");
        }
        int deleted = jdbc.sql("""
                DELETE FROM asg_furniture_report_photo WHERE id = :id AND allocation_id = :a AND furniture_item_id IS NULL
                """).param("id", id).param("a", allocationId).update();
        if (deleted == 0) {
            throw ApiException.notFound("This photo does not exist.");
        }
    }

    /**
     * The student submits their check-out declaration: every item of their Bed and every shared item of the Room has a
     * photo, and the meter readings are entered with a photo (when {@code checkout.photos_required}). Final after this.
     */
    @Transactional
    public Charges submitMyDeclaration() {
        long allocationId = myOpenAllocation();
        notSubmitted(allocationId);
        Target t = targetOf(allocationId);
        boolean photos = parameters.boolValue("checkout.photos_required");
        long withoutPhoto = jdbc.sql("""
                SELECT count(*) FROM inv_furniture_item i JOIN inv_furniture_type ty ON ty.id = i.furniture_type_id
                WHERE i.room_id = :room AND i.status <> 'DISPOSED'
                  AND (ty.use_scope <> 'PERSONAL' OR i.bed_id IS NULL OR i.bed_id = :bed)
                  AND NOT EXISTS (SELECT 1 FROM asg_furniture_report_photo p
                                  WHERE p.allocation_id = :a AND p.furniture_item_id = i.id)
                """).param("room", t.roomId()).param("bed", t.bedId()).param("a", allocationId)
                .query(Long.class).single();
        StudentMeters meters = studentMeters(allocationId);
        FieldErrors errors = new FieldErrors();
        errors.check(!photos || withoutPhoto == 0, "items", "Add a photo of every item of your Bed and Room.");
        errors.check(meters.electricity() != null && meters.water() != null, "meters", "Enter the meter readings.");
        errors.check(!photos || !meters.photos().isEmpty(), "photo", "Add a photo of the meters.");
        errors.throwIfAny();
        jdbc.sql("INSERT INTO asg_check_out_declaration (allocation_id, submitted_at) VALUES (:a, :now)")
                .param("a", allocationId).param("now", Timestamp.from(Instant.now(clock))).update();
        return mine();
    }

    /** A submitted check-out declaration is final. */
    private void notSubmitted(long allocationId) {
        if (declarationSubmitted(allocationId) != null) {
            throw ApiException.conflict("DECLARATION_SUBMITTED",
                    "You have submitted your check-out declaration; it can no longer be changed.");
        }
    }

    /** The Allocation {@link #mine()} shows, while its check-out is not completed. */
    private long myOpenAllocation() {
        long me = currentUser.require(Role.STUDENT).userId();
        return jdbc.sql("""
                SELECT a.id FROM asg_allocation a LEFT JOIN asg_check_out c ON c.allocation_id = a.id
                WHERE a.student_id = :s AND a.status = 'ACTIVE' AND (c.id IS NULL OR c.status <> 'COMPLETED')
                ORDER BY (c.id IS NOT NULL) DESC, a.id DESC LIMIT 1
                """).param("s", me).query(Long.class).optional()
                .orElseThrow(() -> ApiException.notFound("You do not hold a Bed this Term."));
    }

    /**
     * The student does not agree with the charges Staff recorded: the items they mean and why. The Staff member who
     * recorded them is told; the student agrees once Staff have checked again and answered.
     */
    @Transactional
    public Charges disputeMine(List<String> itemIds, String reason) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        record Open(long checkOutId, long allocationId, Long staffId, Instant agreedAt, java.math.BigDecimal charge) {
        }
        Open o = jdbc.sql("""
                SELECT c.id, c.allocation_id, c.draft_by, c.student_agreed_at, c.damage_charge
                FROM asg_check_out c JOIN asg_allocation a ON a.id = c.allocation_id
                WHERE a.student_id = :s AND c.status <> 'COMPLETED'
                ORDER BY c.id DESC LIMIT 1 FOR UPDATE OF c
                """).param("s", me.userId())
                .query((rs, i) -> new Open(rs.getLong("id"), rs.getLong("allocation_id"),
                        rs.getObject("draft_by", Long.class),
                        rs.getTimestamp("student_agreed_at") == null ? null : rs.getTimestamp("student_agreed_at").toInstant(),
                        rs.getBigDecimal("damage_charge")))
                .optional()
                .orElseThrow(() -> ApiException.conflict("NOTHING_TO_DISPUTE", "Staff have not recorded your check-out yet."));
        if (o.agreedAt() != null) {
            throw ApiException.conflict("ALREADY_AGREED", "You have already agreed with these charges.");
        }
        Dispute last = dispute(o.allocationId());
        if (last != null && "Open".equals(last.status())) {
            throw ApiException.conflict("DISPUTE_OPEN", "Staff are already checking your disagreement.");
        }
        String text = reason == null ? "" : reason.trim();
        if (text.isEmpty()) {
            throw FieldErrors.single("reason", "Write why you do not agree.");
        }
        if (text.length() > 500) {
            throw FieldErrors.single("reason", "Keep the reason under 500 characters.");
        }
        Target t = targetOf(o.allocationId());
        long id = jdbc.sql("""
                INSERT INTO asg_check_out_dispute (allocation_id, reason, status, created_at)
                VALUES (:a, :r, 'OPEN', :now) RETURNING id
                """).param("a", o.allocationId()).param("r", text).param("now", Timestamp.from(Instant.now(clock)))
                .query(Long.class).single();
        for (String itemId : itemIds == null ? List.<String>of() : itemIds) {
            long item = StudentHandoverService.parseItem(itemId);
            jdbc.sql("""
                    INSERT INTO asg_check_out_dispute_item (dispute_id, furniture_item_id)
                    SELECT :d, i.id FROM inv_furniture_item i WHERE i.id = :i AND i.room_id = :room
                    ON CONFLICT DO NOTHING
                    """).param("d", id).param("i", item).param("room", t.roomId()).update();
        }
        if (o.staffId() != null) {
            String student = users.displayNames(List.of(me.userId())).getOrDefault(me.userId(), "");
            events.publishEvent(new CheckOutDisputed(o.staffId(), student, t.roomCode(), text));
        }
        return mine();
    }

    /**
     * Staff answer a student's disagreement after checking the Room again (and changing the charges if needed, through
     * {@link #record}); the student is asked to agree with the charges now recorded.
     */
    @Transactional
    public Charges answerDispute(String allocationId, String answer) {
        AuthenticatedUser me = currentUser.require(Permission.DESK);
        Target t = target(allocationId, true);
        String text = answer == null ? "" : answer.trim();
        if (text.isEmpty()) {
            throw FieldErrors.single("answer", "Write what you checked and decided.");
        }
        if (text.length() > 500) {
            throw FieldErrors.single("answer", "Keep the answer under 500 characters.");
        }
        int answered = jdbc.sql("""
                UPDATE asg_check_out_dispute SET status = 'ANSWERED', answer = :ans, answered_at = :now, answered_by = :by
                WHERE allocation_id = :a AND status = 'OPEN'
                """).param("ans", text).param("now", Timestamp.from(Instant.now(clock))).param("by", me.userId())
                .param("a", t.allocationId()).update();
        if (answered == 0) {
            throw ApiException.conflict("NO_OPEN_DISPUTE", "The student has no disagreement to answer.");
        }
        Charges view = view(t);
        audit.record("CHECK_OUT_DISPUTE_ANSWERED", AuditLog.Tone.INFO, "Allocation", t.allocationId(),
                "Room " + t.roomCode() + " · Bed " + t.bedLabel(), Map.of("charge", view.total()));
        events.publishEvent(new CheckOutDisputeAnswered(t.studentId(), t.roomCode(), view.total(), text));
        return view;
    }

    @Transactional
    public Charges agree() {
        long me = currentUser.require(Role.STUDENT).userId();
        if (jdbc.sql("""
                SELECT count(*) FROM asg_check_out_dispute d JOIN asg_allocation a ON a.id = d.allocation_id
                WHERE a.student_id = :s AND d.status = 'OPEN'
                """).param("s", me).query(Long.class).single() > 0) {
            throw ApiException.conflict("DISPUTE_OPEN", "Staff are checking your disagreement; agree once they answer.");
        }
        Long checkOutId = jdbc.sql("""
                SELECT c.id FROM asg_check_out c JOIN asg_allocation a ON a.id = c.allocation_id
                WHERE a.student_id = :s AND c.status <> 'COMPLETED' AND c.damage_charge IS NOT NULL
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
        Map<Long, List<String>> studentPhotos = new HashMap<>();
        jdbc.sql("""
                SELECT furniture_item_id, file_id FROM asg_furniture_report_photo
                WHERE allocation_id = :a ORDER BY id
                """).param("a", t.allocationId())
                .query((rs, i) -> Map.entry(rs.getLong("furniture_item_id"), links.link(rs.getLong("file_id"))))
                .list().forEach(e -> studentPhotos.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
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
                    rep == null ? null : rep.note(), rep == null ? null : rep.at(),
                    s != null && recorded ? (s.sharedWith() == null ? 1 : s.sharedWith()) : l.sharedWith(),
                    s != null && recorded ? (s.fullAmount() == null ? s.amount() : s.fullAmount()) : l.fullAmount(),
                    studentPhotos.getOrDefault(l.itemId(), List.of())));
        }
        record Meta(Boolean present, Instant agreed, BigDecimal electricity, BigDecimal water, String status,
                Long held, String period, Long share, Long unpaid, Long damage, Long settled, Instant completed) {
        }
        Meta meta = checkOutId.map(id -> jdbc.sql("""
                SELECT student_present, student_agreed_at, electricity, water, status, deposit_held, share_period,
                       utility_share, unpaid_utility, damage_charge, settled_amount,
                       CASE WHEN status = 'COMPLETED' THEN coalesce(completed_at, updated_at) END AS completed
                FROM asg_check_out WHERE id = :id
                """)
                .param("id", id).query((rs, i) -> new Meta(rs.getObject("student_present", Boolean.class),
                        HandoverCore.instant(rs, "student_agreed_at"), rs.getBigDecimal("electricity"),
                        rs.getBigDecimal("water"), rs.getString("status"), rs.getObject("deposit_held", Long.class),
                        rs.getString("share_period"), rs.getObject("utility_share", Long.class),
                        rs.getObject("unpaid_utility", Long.class), rs.getObject("damage_charge", Long.class),
                        rs.getObject("settled_amount", Long.class), HandoverCore.instant(rs, "completed"))).single())
                .orElse(new Meta(null, null, null, null, null, null, null, null, null, null, null, null));
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
                inventory.conditionLevels(), meta.electricity(), meta.water(), settlement,
                checkInReport(t.allocationId()), charges.roommates(t.allocationId(), t.termId(), t.roomId()).size() + 1,
                studentMeters(t.allocationId()), declarationSubmitted(t.allocationId()), dispute(t.allocationId()),
                meta.completed());
    }

    private Dispute dispute(long allocationId) {
        record Row(long id, String status, String reason, Instant createdAt, String answer, Instant answeredAt) {
        }
        return jdbc.sql("""
                SELECT id, status, reason, created_at, answer, answered_at FROM asg_check_out_dispute
                WHERE allocation_id = :a ORDER BY id DESC LIMIT 1
                """).param("a", allocationId)
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getString("status"), rs.getString("reason"),
                        rs.getTimestamp("created_at").toInstant(), rs.getString("answer"),
                        rs.getTimestamp("answered_at") == null ? null : rs.getTimestamp("answered_at").toInstant()))
                .optional().map(r -> new Dispute(String.valueOf(r.id()), "OPEN".equals(r.status()) ? "Open" : "Answered",
                        jdbc.sql("SELECT furniture_item_id FROM asg_check_out_dispute_item WHERE dispute_id = :d ORDER BY 1")
                                .param("d", r.id()).query(Long.class).list().stream().map(id -> "furniture-" + id).toList(),
                        r.reason(), r.createdAt(), r.answer(), r.answeredAt()))
                .orElse(null);
    }

    private Instant declarationSubmitted(long allocationId) {
        return jdbc.sql("SELECT submitted_at FROM asg_check_out_declaration WHERE allocation_id = :a")
                .param("a", allocationId).query((rs, i) -> rs.getTimestamp("submitted_at").toInstant()).optional()
                .orElse(null);
    }

    private StudentMeters studentMeters(long allocationId) {
        List<MeterPhoto> photos = jdbc.sql("""
                SELECT id, file_id FROM asg_furniture_report_photo
                WHERE allocation_id = :a AND furniture_item_id IS NULL ORDER BY id
                """).param("a", allocationId)
                .query((rs, i) -> new MeterPhoto(String.valueOf(rs.getLong("id")), links.link(rs.getLong("file_id"))))
                .list();
        record Reading(BigDecimal electricity, BigDecimal water, Instant at) {
        }
        Reading r = jdbc.sql("SELECT electricity, water, updated_at FROM asg_check_out_meter_report WHERE allocation_id = :a")
                .param("a", allocationId)
                .query((rs, i) -> new Reading(rs.getBigDecimal("electricity"), rs.getBigDecimal("water"),
                        rs.getTimestamp("updated_at").toInstant()))
                .optional().orElse(new Reading(null, null, null));
        return new StudentMeters(r.electricity(), r.water(), r.at(), photos);
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
                        rs.getString("override_reason"), rs.getString("manager_review"), rs.getString("review_note"),
                        rs.getObject("shared_with", Integer.class), rs.getObject("full_amount", Long.class)))
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
