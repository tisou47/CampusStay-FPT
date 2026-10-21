package vn.fpt.campusstay.bil.internal;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import vn.fpt.campusstay.cfg.UtilityPolicy;

/**
 * Splits a Room's shared meter for one billing period. The readings that cut
 * the period (start, readings taken when residents changed, end) make
 * segments; each segment's cost is shared by the residents in proportion to
 * the time each lived in the Room during it, so a student who moved in or out
 * mid-segment pays only for their days. Totals are rounded by the Admin rule.
 * No database access: unit-tested alone.
 */
final class UtilitySplit {

    /** A meter reading at a moment: the period start, a cut, or the period end. */
    record Point(LocalDate day, Instant at, BigDecimal electricity, BigDecimal water) {
    }

    /** @param settled the stay ended with a check-out whose share was settled from the Utility Deposit */
    record Resident(long studentId, long allocationId, long termId, Instant from, Instant to, boolean settled) {
    }

    /** @param shares student id → exact share before rounding */
    record Segment(LocalDate from, LocalDate to, int residents, BigDecimal kwh, BigDecimal m3, long electricityCost,
            long waterCost, Map<Long, BigDecimal> shares) {
    }

    record Share(long studentId, long allocationId, long termId, long amount, boolean settled) {
    }

    record Result(List<Segment> segments, List<Share> shares) {
    }

    private UtilitySplit() {
    }

    static Result split(List<Point> points, List<Resident> residents, UtilityPolicy.Prices prices) {
        List<Segment> segments = new ArrayList<>();
        Map<Long, BigDecimal> totals = new LinkedHashMap<>();
        for (int i = 0; i + 1 < points.size(); i++) {
            Point a = points.get(i);
            Point b = points.get(i + 1);
            BigDecimal kwh = b.electricity().subtract(a.electricity()).max(BigDecimal.ZERO);
            BigDecimal m3 = b.water().subtract(a.water()).max(BigDecimal.ZERO);
            long electricityCost = kwh.multiply(BigDecimal.valueOf(prices.priceKwh())).setScale(0, RoundingMode.HALF_UP)
                    .longValueExact();
            long waterCost = m3.multiply(BigDecimal.valueOf(prices.priceM3())).setScale(0, RoundingMode.HALF_UP)
                    .longValueExact();
            Map<Long, Long> seconds = new LinkedHashMap<>();
            for (Resident r : residents) {
                Instant from = r.from().isAfter(a.at()) ? r.from() : a.at();
                Instant to = r.to() == null || r.to().isAfter(b.at()) ? b.at() : r.to();
                long overlap = Duration.between(from, to).getSeconds();
                if (overlap > 0) {
                    seconds.merge(r.studentId(), overlap, Long::sum);
                }
            }
            long all = seconds.values().stream().mapToLong(Long::longValue).sum();
            Map<Long, BigDecimal> shares = new LinkedHashMap<>();
            if (all > 0) {
                BigDecimal cost = BigDecimal.valueOf(electricityCost + waterCost);
                seconds.forEach((student, s) -> {
                    BigDecimal share = cost.multiply(BigDecimal.valueOf(s)).divide(BigDecimal.valueOf(all), 4,
                            RoundingMode.HALF_UP);
                    shares.put(student, share);
                    totals.merge(student, share, BigDecimal::add);
                });
            }
            segments.add(new Segment(a.day(), b.day(), seconds.size(), kwh, m3, electricityCost, waterCost, shares));
        }
        List<Share> result = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (int i = residents.size() - 1; i >= 0; i--) {
            Resident r = residents.get(i);
            BigDecimal total = totals.get(r.studentId());
            if (total != null && seen.add(r.studentId())) {
                long amount = prices.round(total.setScale(0, RoundingMode.CEILING).longValueExact());
                boolean settled = residents.stream().filter(x -> x.studentId() == r.studentId())
                        .allMatch(Resident::settled);
                result.add(0, new Share(r.studentId(), r.allocationId(), r.termId(), amount, settled));
            }
        }
        return new Result(segments, result);
    }
}
