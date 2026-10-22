package vn.fpt.campusstay.service.billing;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

import vn.fpt.campusstay.service.setting.UtilityPolicy;
import vn.fpt.campusstay.config.TimeConfig;

/** How a Room's meter is split between its residents (TC-BIL-022). */
class UtilitySplitTest {

    private static final UtilityPolicy.Prices PRICES = new UtilityPolicy.Prices(3500, 15000, "ROUND_UP_1000", 7);

    private static Instant at(int month, int day) {
        return LocalDate.of(2026, month, day).atStartOfDay(TimeConfig.CAMPUS_ZONE).toInstant();
    }

    private static UtilitySplit.Point point(int month, int day, int kwh, int m3) {
        return new UtilitySplit.Point(LocalDate.of(2026, month, day), at(month, day), BigDecimal.valueOf(kwh),
                BigDecimal.valueOf(m3));
    }

    private static UtilitySplit.Resident resident(long student, Instant from, Instant to, boolean settled) {
        return new UtilitySplit.Resident(student, student * 10, 7, from, to, settled);
    }

    /** TC-BIL-022: residents who lived in the Room the whole month pay equal shares. */
    @Test
    void equalSharesForTheWholeMonth() {
        UtilitySplit.Result result = UtilitySplit.split(List.of(point(10, 1, 0, 0), point(11, 1, 100, 10)),
                List.of(resident(1, at(9, 1), null, false), resident(2, at(9, 1), null, false)), PRICES);

        assertThat(result.segments()).singleElement().satisfies(s -> {
            assertThat(s.electricityCost()).isEqualTo(350_000);
            assertThat(s.waterCost()).isEqualTo(150_000);
            assertThat(s.residents()).isEqualTo(2);
        });
        assertThat(result.shares()).extracting(UtilitySplit.Share::amount).containsExactly(250_000L, 250_000L);
        assertThat(result.shares()).extracting(UtilitySplit.Share::allocationId).containsExactly(10L, 20L);
    }

    /** TC-BIL-022: a check-out cuts the meter; the leaver's share is marked settled (paid from the Utility Deposit). */
    @Test
    void aCheckOutSplitsTheMonthIntoSegments() {
        UtilitySplit.Result result = UtilitySplit.split(
                List.of(point(10, 1, 0, 0), point(10, 16, 60, 6), point(11, 1, 100, 10)),
                List.of(resident(1, at(9, 1), null, false), resident(2, at(9, 1), null, false),
                        resident(3, at(9, 1), at(10, 16), true)),
                PRICES);

        assertThat(result.segments()).hasSize(2);
        assertThat(result.segments().get(0).residents()).isEqualTo(3);
        assertThat(result.segments().get(1).residents()).isEqualTo(2);
        assertThat(result.shares()).extracting(UtilitySplit.Share::studentId).containsExactly(1L, 2L, 3L);
        assertThat(result.shares()).extracting(UtilitySplit.Share::amount).containsExactly(200_000L, 200_000L, 100_000L);
        assertThat(result.shares()).extracting(UtilitySplit.Share::settled).containsExactly(false, false, true);
    }

    /** TC-BIL-022: within a segment, shares follow the time each resident lived in the Room; totals round up. */
    @Test
    void sharesFollowTimeInTheRoom() {
        UtilitySplit.Result result = UtilitySplit.split(List.of(point(10, 1, 0, 0), point(10, 31, 100, 0)),
                List.of(resident(1, at(9, 1), null, false), resident(2, at(10, 16), null, false)), PRICES);

        // 350,000 VND over 30 + 15 resident-days: 233,333.33 and 116,666.67, rounded up to thousands.
        assertThat(result.shares()).extracting(UtilitySplit.Share::amount).containsExactly(234_000L, 117_000L);
    }

    /** TC-BIL-022: without a reading at the end there is nothing to share yet. */
    @Test
    void noEndReadingNoShares() {
        UtilitySplit.Result result = UtilitySplit.split(List.of(point(10, 1, 0, 0)),
                List.of(resident(1, at(9, 1), null, false)), PRICES);

        assertThat(result.segments()).isEmpty();
        assertThat(result.shares()).isEmpty();
    }
}
