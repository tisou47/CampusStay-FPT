package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Compares a student's check-in inventory with the Room's record before it (an inspection, another inventory or a
 * check-out). Good and Worn count as the same; an item the record does not know is never a difference. The meters
 * may have moved by at most {@code max(tolerance, use per resident and hour × the person-hours lived in the Room since
 * the reading)} (the caller adds up each resident's hours since their arrival or the reading, whichever is later).
 * <ul>
 * <li>Matched: every item agrees and the meters are within the limit;</li>
 * <li>Major: an item the record had in the Room is reported Missing, a meter is beyond the limit, or at least
 * {@code majorMismatches} items differ (Staff should check the Room);</li>
 * <li>Minor: anything else.</li>
 * </ul>
 * No database access: unit-tested alone.
 */
final class HandoverComparison {

    /** @param condition the student's answer; {@code baseline} the record's, null when it has none */
    record Item(long itemId, String label, String condition, String baseline) {
    }

    /** The parameters of section "Room handover". */
    record Limits(BigDecimal electricityTolerance, BigDecimal electricityPerPersonHour, BigDecimal waterTolerance,
            BigDecimal waterPerPersonHour, int majorMismatches) {
    }

    /**
     * @param level      {@code MATCHED}, {@code MINOR} or {@code MAJOR}
     * @param notes      one line per difference, for Staff
     * @param mismatched the items that differ
     */
    record Result(String level, List<String> notes, Set<Long> mismatched) {
    }

    private HandoverComparison() {
    }

    /** Good and Worn are the same state of use; otherwise the conditions must be equal. */
    static boolean same(String a, String b) {
        return a.equals(b) || used(a) && used(b);
    }

    private static boolean used(String condition) {
        return condition.equals("GOOD") || condition.equals("WORN");
    }

    /** The most a meter may have moved since the baseline reading. */
    static BigDecimal allowed(BigDecimal tolerance, BigDecimal perPersonHour, long hours, int residents) {
        BigDecimal use = perPersonHour.multiply(BigDecimal.valueOf(Math.max(0, hours)))
                .multiply(BigDecimal.valueOf(Math.max(1, residents))).setScale(1, RoundingMode.HALF_UP);
        return tolerance.max(use);
    }

    /**
     * @param electricity the student's reading; {@code baseElectricity} the record's, null when the Room has none
     * @param hours       since the baseline reading
     * @param residents   living in the Room (the student included)
     */
    static Result compare(List<Item> items, BigDecimal electricity, BigDecimal baseElectricity, BigDecimal water,
            BigDecimal baseWater, long hours, int residents, Limits limits) {
        List<String> notes = new ArrayList<>();
        Set<Long> mismatched = new LinkedHashSet<>();
        boolean major = false;
        for (Item item : items) {
            if (item.baseline() == null || item.condition() == null || same(item.condition(), item.baseline())) {
                continue;
            }
            mismatched.add(item.itemId());
            notes.add(item.label() + ": " + label(item.baseline()) + " → " + label(item.condition()));
            if (item.condition().equals("MISSING")) {
                major = true;
            }
        }
        if (mismatched.size() >= Math.max(1, limits.majorMismatches())) {
            major = true;
        }
        major |= meter("Electricity", "kWh", electricity, baseElectricity,
                allowed(limits.electricityTolerance(), limits.electricityPerPersonHour(), hours, residents), notes);
        major |= meter("Water", "m³", water, baseWater,
                allowed(limits.waterTolerance(), limits.waterPerPersonHour(), hours, residents), notes);
        String level = major ? "MAJOR" : notes.isEmpty() ? "MATCHED" : "MINOR";
        return new Result(level, List.copyOf(notes), Set.copyOf(mismatched));
    }

    /** @return the difference is beyond the limit */
    private static boolean meter(String name, String unit, BigDecimal value, BigDecimal base, BigDecimal allowed,
            List<String> notes) {
        if (value == null || base == null) {
            return false;
        }
        BigDecimal difference = value.subtract(base);
        if (difference.compareTo(allowed) <= 0) {
            return false;
        }
        notes.add(name + " " + (difference.signum() >= 0 ? "+" : "") + difference.stripTrailingZeros().toPlainString()
                + " " + unit + " (allowed " + allowed.stripTrailingZeros().toPlainString() + " " + unit + ")");
        return true;
    }

    static String label(String condition) {
        return switch (condition) {
            case "GOOD" -> "Good";
            case "WORN" -> "Worn";
            case "DAMAGED" -> "Damaged";
            case "MISSING" -> "Missing";
            default -> condition;
        };
    }
}
