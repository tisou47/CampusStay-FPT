package vn.fpt.campusstay.event;

/**
 * A final check-in inventory found an item Damaged or Missing that the Room's record had in use (ASG). MNT opens a
 * Furniture Maintenance Request, or plans a spare from the Block store for a Missing item. Never charged to the
 * student who found it.
 *
 * @param condition {@code DAMAGED} or {@code MISSING}
 */
public record FurnitureFoundDamaged(long roomId, long furnitureItemId, String condition, String note, long reporterId,
        String source) {
}
