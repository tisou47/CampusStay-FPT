package vn.fpt.campusstay.event;

/**
 * The desk recorded damage to a furniture item at a check-out (Assignment → Inventory): the item becomes Broken,
 * in the same transaction.
 *
 * @param reason e.g. {@code Damaged at the check-out of Room A-501 · Bed A: door hinge broken}
 * @param byUserId the Staff member at the desk
 */
public record FurnitureDamaged(long itemId, String reason, long byUserId) {
}
