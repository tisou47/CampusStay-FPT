package vn.fpt.campusstay.event;

/**
 * A Manager handled an overdue Room-Change Request by arranging a temporary Bed (review finding BE-OPS-02): the
 * student and the request's owner read the Manager's note; the request itself stays open.
 *
 * @param ownerId the Staff in charge of the request, null when nobody is
 */
public record TemporaryBedArranged(long studentId, Long ownerId, String code, String note) {
}
