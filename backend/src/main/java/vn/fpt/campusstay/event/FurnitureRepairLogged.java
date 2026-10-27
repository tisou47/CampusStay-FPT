package vn.fpt.campusstay.event;

/**
 * A Maintenance Request that names a furniture item was reported, resolved or re-linked (Maintenance → Inventory):
 * the item's history gets a repair entry, written in the same transaction.
 *
 * @param requestCode the request's code, e.g. {@code MR-000321}
 * @param step        {@code Reported} or {@code Resolved}
 * @param byUserId    who did it (the reporter, or the staff member who resolved it)
 */
public record FurnitureRepairLogged(long itemId, String requestCode, String title, String step, long byUserId) {
}
