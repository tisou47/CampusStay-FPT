package vn.fpt.campusstay.event;

import java.time.LocalDate;

/**
 * A resident's stay is terminated (spec §6.15): Utility debt, not enrolled or a Manager's decision. The student
 * must check out by {@code moveOutBy}; Billing closes the Utility warnings.
 *
 * @param reason {@code UTILITY_DEBT}, {@code NOT_ENROLLED} or {@code MANAGER}
 */
public record TerminationStarted(long terminationId, long allocationId, long studentId, String room, String reason,
        LocalDate moveOutBy) {
}
