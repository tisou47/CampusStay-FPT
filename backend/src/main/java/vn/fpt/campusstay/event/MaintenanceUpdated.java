package vn.fpt.campusstay.event;

/**
 * A change the reporter should hear about: a new status, a visit window or a
 * public update (Notifications: "Maintenance Request updated"). Internal notes never
 * publish it.
 *
 * @param status  the status label after the change
 * @param message the public update text, or null
 */
public record MaintenanceUpdated(long requestId, String code, long reporterId, String title, String status,
        String message) {
}
