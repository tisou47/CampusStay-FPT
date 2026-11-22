package vn.fpt.campusstay.service.auth;

import java.time.Instant;
import java.util.List;

/**
 * Port implemented by the modules that hand work to Staff (Maintenance for Maintenance Requests and inspections,
 * Requests for Room-Change Requests), for Block Manager › Staff: one person's open items, and moving one to someone
 * else. Auth checks who may receive it; the module checks the item and writes its own history.
 */
public interface StaffWork {

    /**
     * An open item assigned to a person.
     *
     * @param type   {@link StaffWorkload#MAINTENANCE}, {@link StaffWorkload#ROOM_CHANGE} or {@link StaffWorkload#INSPECTION}
     * @param id     the item's database id (as a string), used to move it
     * @param code   what people call it ({@code MR-000321}, {@code RC-SP27-000012}; an inspection's day {@code 12/11/2026})
     * @param dueAt  when it must be finished, or null
     * @param link   the back-office screen of the item
     * @param assigneeId the person who holds it; {@code buildingId} its Block
     */
    record Item(String type, String id, String code, String title, String roomCode, String status, Instant openedAt,
            Instant dueAt, boolean overdue, String link, long assigneeId, long buildingId) {
    }

    /** Whether this implementation owns the kind of item. */
    boolean handles(String type);

    /** The person's open items of the kinds this implementation owns. */
    List<Item> openItems(long userId);

    /**
     * The item while it is open, locked until the transaction ends; null when it does not exist or is no longer open.
     */
    Item lockOpen(String type, long id);

    /**
     * Gives the open item to someone else and writes its history; throws {@code 409 ITEM_CLOSED} when it is no
     * longer open. Runs inside the caller's transaction.
     */
    void reassign(String type, long id, long toUserId, String note);

    /**
     * Puts the open item back in its Block's queue with nobody in charge, because its holder left the Block or was
     * disabled (BE-3RD-01); does nothing when it is no longer open. Runs inside the caller's transaction.
     */
    void release(String type, long id, String note);
}
