/**
 * Whether the inspector may attach a photo to an item: the API takes item photos for the Room's furniture only
 * (`itemId` "furniture-<id>"), and one is worth taking when the item is Damaged or Missing.
 */
export function photoAllowed(item, answer) {
  return Boolean(item?.furniture) && (answer?.condition === 'Damaged' || answer?.condition === 'Missing')
}
