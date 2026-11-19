package vn.fpt.campusstay.event;

/**
 * A Manager moved an open item from one staff member to another on Manager › Staff and workload (Notifications:
 * "Work moved to you").
 *
 * @param code the item's code ({@code MR-000321}, {@code RC-SP27-000012}, an inspection's day)
 * @param from the name of the person who held it; {@code by} the Manager's name
 * @param link the Staff screen of the item
 */
public record WorkReassigned(long toUserId, String code, String title, String from, String by, String note,
        String link) {
}
