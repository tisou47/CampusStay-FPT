package vn.fpt.campusstay.event;

/**
 * A student reported a Maintenance Request (Requests: routing rules may assign it).
 * Published in the reporting transaction.
 *
 * @param category code of the {@code MAINTENANCE_CATEGORY} list
 */
public record MaintenanceReported(long requestId, String code, long buildingId, String category, String urgency) {
}
