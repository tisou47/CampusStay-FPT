package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

/**
 * What inspections recorded about a Room (implemented by MNT, which already uses ASG's {@link Residences}): the
 * baseline of a check-in inventory. Students never read these through any endpoint.
 */
public interface InspectionRecords {

    /** @param condition {@code GOOD}, {@code WORN}, {@code DAMAGED} or {@code MISSING} */
    record Condition(String condition, Instant at) {
    }

    record Meters(BigDecimal electricity, BigDecimal water, Instant at) {
    }

    /** Furniture item id → its latest condition recorded in a finished inspection of the Room. */
    Map<Long, Condition> latestConditions(long roomId);

    /**
     * Furniture item id → its worst condition recorded by inspections of the Room since {@code since} (Damaged and
     * Missing only): what an item went through while a student lived there, even if it was repaired since.
     */
    Map<Long, String> worstSince(long roomId, Instant since);

    /** The Room's latest meters read in an inspection. */
    Optional<Meters> latestMeters(long roomId);
}
