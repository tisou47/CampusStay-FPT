package vn.fpt.campusstay.event;

/**
 * The Admin moved a registration-period request on (spec §6.3): {@code IN_PROGRESS} (building the Term),
 * {@code NEEDS_CHANGES} (back to the Manager with a note) or {@code REJECTED} (with a reason). The requesting
 * Manager is told.
 */
public record TermRequestDecided(long requestId, String code, String termName, String status, String adminName,
        String note, long requesterId) {
}
