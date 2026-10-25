package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Matching weights as levels (D-06, spec §6.17): Very important counts twice as much as Important, Not used not at
 * all; the engine keeps whole percentages that total 100.
 */
final class MatchingLevels {

    static final String VERY_IMPORTANT = "Very important";
    static final String IMPORTANT = "Important";
    static final String NOT_USED = "Not used";

    private MatchingLevels() {
    }

    /**
     * The level a stored weight shows: one and a half times the smallest weight in use or more is Very important
     * (weights saved as levels are exactly twice), the others in use Important.
     */
    static String level(boolean on, int percent, List<Integer> percentsInUse) {
        if (!on || percent <= 0) {
            return NOT_USED;
        }
        int smallest = percentsInUse.stream().filter(p -> p > 0).min(Integer::compare).orElse(percent);
        return percent * 2 >= smallest * 3 ? VERY_IMPORTANT : IMPORTANT;
    }

    /** Whole percentages for the levels, totalling 100 (the remainder goes to the first weight in use); null if none is used. */
    static Map<String, Integer> percents(Map<String, String> levels) {
        Map<String, Integer> points = new LinkedHashMap<>();
        levels.forEach((key, level) -> points.put(key, switch (level == null ? NOT_USED : level) {
            case VERY_IMPORTANT -> 2;
            case IMPORTANT -> 1;
            default -> 0;
        }));
        int total = points.values().stream().mapToInt(Integer::intValue).sum();
        if (total == 0) {
            return null;
        }
        Map<String, Integer> result = new LinkedHashMap<>();
        int given = 0;
        List<String> used = new ArrayList<>();
        for (Map.Entry<String, Integer> e : points.entrySet()) {
            int value = BigDecimal.valueOf(e.getValue() * 100L).divide(BigDecimal.valueOf(total), 0, RoundingMode.DOWN)
                    .intValue();
            result.put(e.getKey(), value);
            given += value;
            if (e.getValue() > 0) {
                used.add(e.getKey());
            }
        }
        String first = used.getFirst();
        result.put(first, result.get(first) + 100 - given);
        return result;
    }

    static boolean known(String level) {
        return VERY_IMPORTANT.equals(level) || IMPORTANT.equals(level) || NOT_USED.equals(level);
    }
}
