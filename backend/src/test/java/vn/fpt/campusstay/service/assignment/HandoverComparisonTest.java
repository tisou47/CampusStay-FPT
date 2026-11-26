package vn.fpt.campusstay.service.assignment;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;

/** How a check-in inventory is compared with the Room's record (TC-ASG-047…052). */
class HandoverComparisonTest {

    private static final HandoverComparison.Limits LIMITS = new HandoverComparison.Limits(new BigDecimal("2"),
            new BigDecimal("0.25"), new BigDecimal("0.2"), new BigDecimal("0.01"), 3);

    private static HandoverComparison.Item item(long id, String condition, String baseline) {
        return new HandoverComparison.Item(id, "Item " + id, condition, baseline);
    }

    private static HandoverComparison.Result compare(List<HandoverComparison.Item> items, String e, String w, long hours,
            int residents) {
        return HandoverComparison.compare(items, new BigDecimal(e), new BigDecimal("100"), new BigDecimal(w),
                new BigDecimal("10"), hours, residents, LIMITS);
    }

    /** TC-ASG-047: Good and Worn count as the same, and meters within the tolerance match. */
    @Test
    void wornMatchesGood() {
        HandoverComparison.Result result = compare(List.of(item(1, "WORN", "GOOD"), item(2, "GOOD", "WORN")), "101.5",
                "10.1", 0, 1);

        assertThat(result.level()).isEqualTo("MATCHED");
        assertThat(result.notes()).isEmpty();
    }

    /** TC-ASG-048: one item reported Damaged where the record says Good is a minor difference. */
    @Test
    void oneDamagedItemIsMinor() {
        HandoverComparison.Result result = compare(List.of(item(1, "DAMAGED", "GOOD"), item(2, "GOOD", "GOOD")), "100",
                "10", 0, 1);

        assertThat(result.level()).isEqualTo("MINOR");
        assertThat(result.mismatched()).containsExactly(1L);
        assertThat(result.notes()).containsExactly("Item 1: Good → Damaged");
    }

    /** TC-ASG-049: an item the record had in the Room reported Missing needs a visit. */
    @Test
    void missingItemIsMajor() {
        assertThat(compare(List.of(item(1, "MISSING", "GOOD")), "100", "10", 0, 1).level()).isEqualTo("MAJOR");
    }

    /** TC-ASG-050: three differing items need a visit. */
    @Test
    void manyDifferencesAreMajor() {
        HandoverComparison.Result result = compare(List.of(item(1, "DAMAGED", "GOOD"), item(2, "DAMAGED", "WORN"),
                item(3, "GOOD", "DAMAGED")), "100", "10", 0, 1);

        assertThat(result.level()).isEqualTo("MAJOR");
    }

    /** TC-ASG-051: the meter limit grows with the hours since the reading and the residents. */
    @Test
    void meterLimitGrowsWithTimeAndResidents() {
        assertThat(compare(List.of(), "135", "10", 0, 1).level()).isEqualTo("MAJOR");
        // 0.25 kWh × 24 h × 4 residents = 24 kWh allowed; 0.01 m³ × 24 × 4 = 0.96 m³.
        assertThat(compare(List.of(), "123", "10.9", 24, 4).level()).isEqualTo("MATCHED");
        HandoverComparison.Result over = compare(List.of(), "125", "10", 24, 4);
        assertThat(over.level()).isEqualTo("MAJOR");
        assertThat(over.notes()).containsExactly("Electricity +25 kWh (allowed 24 kWh)");
    }

    /**
     * TC-ASG-064: meters only go up: a reading below the record beyond the lower tolerance is a Major difference, one
     * within it matches.
     */
    @Test
    void readingBelowTheRecordIsMajor() {
        HandoverComparison.Limits limits = new HandoverComparison.Limits(new BigDecimal("2"), new BigDecimal("0.25"),
                new BigDecimal("0.2"), new BigDecimal("0.01"), 3, new BigDecimal("0.5"), new BigDecimal("0.05"));
        HandoverComparison.Result lower = HandoverComparison.compare(List.of(), new BigDecimal("1450"),
                new BigDecimal("1703"), new BigDecimal("45"), new BigDecimal("45"), 48, 1, limits);
        assertThat(lower.level()).isEqualTo("MAJOR");
        assertThat(lower.notes()).containsExactly("Electricity -253 kWh (lower than the record: meters only go up)");
        assertThat(HandoverComparison.compare(List.of(), new BigDecimal("1702.6"), new BigDecimal("1703"),
                new BigDecimal("44.96"), new BigDecimal("45"), 0, 1, limits).level()).isEqualTo("MATCHED");
        // Without a lower tolerance any lower reading needs a visit.
        assertThat(compare(List.of(), "99.9", "10", 0, 1).level()).isEqualTo("MAJOR");
    }

    /** TC-ASG-052: items the record does not know are never a difference. */
    @Test
    void itemsWithoutRecordAreNotCompared() {
        assertThat(compare(List.of(item(1, "DAMAGED", null), item(2, "MISSING", null)), "100", "10", 0, 1).level())
                .isEqualTo("MATCHED");
    }
}
