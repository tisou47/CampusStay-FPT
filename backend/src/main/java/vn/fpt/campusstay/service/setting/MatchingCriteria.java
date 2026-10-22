package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/** Settings public API: the matching snapshots the assignment engine runs with (Admin › Matching Criteria). */
public interface MatchingCriteria {

    record Criterion(String key, String title) {
    }

    /** A switched-on weight as a fraction; the switched-on weights total 1. */
    record Weight(String key, String label, BigDecimal value) {
    }

    /** @param boost multiplier when a student's Roommate preferences match (1 = none) */
    record Snapshot(long id, String label, List<String> hardConstraints, List<Criterion> order, List<Weight> weights,
            BigDecimal boost) {
    }

    Snapshot active();

    Optional<Snapshot> byId(long id);
}
