package vn.fpt.campusstay.service.assignment;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.inventory.Inventory;

/**
 * Furniture charges at check-out. The student answers only for what got worse while they lived there:
 * <ul>
 * <li>a personal item (of their Bed): its condition at check-out, or the worst an inspection recorded during the stay,
 * against its condition in their final check-in inventory (without one: Good). Charge = the price of one new item of
 * its type × (share lost in the condition now − share lost in the condition at check-in), never below 0. An item
 * recorded as there before the student is never charged;</li>
 * <li>a shared item: damage the student acknowledged ({@code asg_damage_claim}); or damage Staff record at the
 * check-out, priced as for a personal item and split evenly among the Room's residents (the leaver and the roommates
 * still living there): the leaver's line carries their share (with the rounding remainder), each roommate is invoiced
 * theirs when the check-out is completed ({@link CheckOutFurnitureService#chargeRoommates}). Otherwise the dorm
 * bears it.</li>
 * </ul>
 * Prices and shares come from Admin › Furniture types (INV's {@code furniturePrices}, {@code conditionLoss}). No
 * dispute window: the student agrees at the desk.
 */
@Component
class CheckOutCharges {

    /**
     * A line of the check-out.
     *
     * @param start     the condition at check-in (null: no inventory, counted as Good)
     * @param now       the condition at check-out (Staff's answer, or the worst during the stay when worse)
     * @param source    {@code PERSONAL}, {@code ACKNOWLEDGED} or {@code NONE} (shared item not acknowledged)
     * @param sharedWith the residents a shared item's damage is split among (1: not split)
     * @param fullAmount the whole charge before the split (equals {@code amount} when not split)
     */
    record Line(long itemId, String assetCode, String type, String typeVi, String bed, boolean personal, String start,
            String now, boolean preExisting, long unitPrice, int percent, long amount, String source, String note,
            int sharedWith, long fullAmount) {
    }

    /** The leaver's share of a charge split among {@code residents}: an even part plus the rounding remainder. */
    static long leaverShare(long full, int residents) {
        return residents <= 1 ? full : full - (residents - 1) * (full / residents);
    }

    /** A roommate's share of a charge split among {@code residents}. */
    static long roommateShare(long full, int residents) {
        return residents <= 1 ? 0 : full / residents;
    }

    /**
     * The other residents of the Room in the Term (living there, Allocation active), not counting {@code allocationId}.
     */
    /**
     * The roommates who lived in the Room at {@code at} (the check-out): resident by then and not gone before. People
     * who moved in later are never charged for damage they did not live with (BE-ASG-03).
     */
    List<Long> roommatesAt(long allocationId, long termId, long roomId, Instant at) {
        List<Long> beds = inventory.bedsOfRoom(roomId).stream().map(Inventory.BedSlot::bedId).toList();
        if (beds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                SELECT id FROM asg_allocation
                WHERE term_id = :term AND status IN ('ACTIVE', 'ENDED') AND bed_id IN (:beds) AND id <> :a
                  AND resident_at IS NOT NULL AND resident_at <= :at AND (ended_at IS NULL OR ended_at >= :at)
                ORDER BY id
                """).param("term", termId).param("beds", beds).param("a", allocationId)
                .param("at", java.sql.Timestamp.from(at)).query(Long.class).list();
    }

    List<Long> roommates(long allocationId, long termId, long roomId) {
        List<Long> beds = inventory.bedsOfRoom(roomId).stream().map(Inventory.BedSlot::bedId).toList();
        if (beds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                SELECT id FROM asg_allocation
                WHERE term_id = :term AND status = 'ACTIVE' AND resident_at IS NOT NULL AND bed_id IN (:beds)
                  AND id <> :a
                ORDER BY id
                """).param("term", termId).param("beds", beds).param("a", allocationId).query(Long.class).list();
    }

    private final JdbcClient jdbc;
    private final Inventory inventory;
    private final InspectionRecords inspections;

    CheckOutCharges(JdbcClient jdbc, Inventory inventory, InspectionRecords inspections) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.inspections = inspections;
    }

    /** The percent of the price a condition costs (Admin › Furniture types › condition levels). */
    int percent(String condition) {
        return condition == null ? 0 : inventory.conditionLoss().getOrDefault(condition, 0);
    }

    /**
     * The lines of the student's check-out.
     *
     * @param answers item id → the condition Staff found at check-out (items not answered: as at check-in)
     * @param residentAt when the student started living in the Room (inspections since then count)
     */
    List<Line> lines(long allocationId, long termId, long roomId, long bedId, Instant residentAt,
            Map<Long, String> answers) {
        Map<Long, String> start = new HashMap<>();
        Map<Long, Boolean> pre = new HashMap<>();
        jdbc.sql("""
                SELECT i.furniture_item_id, coalesce(i.verified_condition, i.condition, i.baseline_condition) AS c,
                       i.pre_existing
                FROM asg_handover_item i JOIN asg_handover h ON h.id = i.handover_id
                WHERE h.allocation_id = :a AND h.status = 'FINAL'
                """).param("a", allocationId).query((rs, i) -> {
                    start.put(rs.getLong("furniture_item_id"), rs.getString("c"));
                    pre.put(rs.getLong("furniture_item_id"), rs.getBoolean("pre_existing"));
                    return null;
                }).list();
        Map<Long, Long> acknowledged = new HashMap<>();
        Map<Long, String> acknowledgedCondition = new HashMap<>();
        jdbc.sql("""
                SELECT furniture_item_id, condition, amount FROM asg_damage_claim
                WHERE allocation_id = :a AND status = 'ACKNOWLEDGED'
                """).param("a", allocationId).query((rs, i) -> {
                    acknowledged.merge(rs.getLong("furniture_item_id"), rs.getLong("amount"), Long::sum);
                    acknowledgedCondition.put(rs.getLong("furniture_item_id"), rs.getString("condition"));
                    return null;
                }).list();
        Map<Long, String> worst = residentAt == null ? Map.of() : inspections.worstSince(roomId, residentAt);
        Map<Long, Long> prices = inventory.furniturePrices();
        int residents = roommates(allocationId, termId, roomId).size() + 1;
        List<Line> lines = new ArrayList<>();
        for (Inventory.FurnitureLine f : inventory.furnitureLines(roomId)) {
            boolean personal = f.personal() && f.bedId() != null;
            if (personal && f.bedId() != bedId) {
                continue;
            }
            long price = prices.getOrDefault(f.typeId(), 0L);
            String at = start.get(f.id());
            String found = answers.getOrDefault(f.id(), at == null ? "GOOD" : at);
            if (personal) {
                String during = worst.get(f.id());
                if (during != null && percent(during) > percent(found)) {
                    found = during;
                }
                boolean before = pre.getOrDefault(f.id(), false);
                int pct = before ? 0 : Math.max(0, percent(found) - percent(at == null ? "GOOD" : at));
                lines.add(new Line(f.id(), f.assetCode(), f.type(), f.typeVi(), f.bedLabel(), true, at, found, before,
                        price, pct, price * pct / 100, "PERSONAL", null, 1, price * pct / 100));
            } else {
                long amount = acknowledged.getOrDefault(f.id(), 0L);
                String claimed = acknowledgedCondition.get(f.id());
                boolean staffRecorded = claimed == null && answers.containsKey(f.id())
                        && percent(found) > percent(at == null ? "GOOD" : at);
                if (staffRecorded) {
                    boolean before = pre.getOrDefault(f.id(), false);
                    int pct = before ? 0 : Math.max(0, percent(found) - percent(at == null ? "GOOD" : at));
                    long full = price * pct / 100;
                    int split = full > 0 ? residents : 1;
                    lines.add(new Line(f.id(), f.assetCode(), f.type(), f.typeVi(), null, false, at, found, before,
                            price, pct, leaverShare(full, split), "PERSONAL",
                            split > 1 ? "Shared item: split among " + split + " residents" : null, split, full));
                } else {
                    lines.add(new Line(f.id(), f.assetCode(), f.type(), f.typeVi(), null, false, at,
                            claimed != null ? claimed : found, pre.getOrDefault(f.id(), false), price,
                            claimed == null ? 0 : percent(claimed), amount, claimed == null ? "NONE" : "ACKNOWLEDGED",
                            claimed == null ? null : "Acknowledged by the student", 1, amount));
                }
            }
        }
        return lines;
    }

    /** The amount a shared item costs in its condition (for a damage claim). */
    long claimAmount(long roomId, long termId, long itemId, String condition) {
        Optional<Inventory.FurnitureLine> line = inventory.furnitureLines(roomId).stream()
                .filter(l -> l.id() == itemId).findFirst();
        long price = line.map(l -> inventory.furniturePrices().getOrDefault(l.typeId(), 0L)).orElse(0L);
        return price * percent(condition) / 100;
    }
}
