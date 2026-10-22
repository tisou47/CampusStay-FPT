package vn.fpt.campusstay.service.inventory;

import java.util.ArrayList;
import java.util.List;
import java.util.SortedSet;

/** {@code [1, 2, 3, 5]} → {@code 1–3, 5}. */
final class FloorRanges {

    private FloorRanges() {
    }

    static String format(SortedSet<Integer> floors) {
        List<String> parts = new ArrayList<>();
        Integer start = null;
        Integer previous = null;
        for (int floor : floors) {
            if (start == null) {
                start = floor;
            } else if (floor != previous + 1) {
                parts.add(range(start, previous));
                start = floor;
            }
            previous = floor;
        }
        if (start != null) {
            parts.add(range(start, previous));
        }
        return String.join(", ", parts);
    }

    private static String range(int from, int to) {
        return from == to ? String.valueOf(from) : from + "–" + to;
    }
}
