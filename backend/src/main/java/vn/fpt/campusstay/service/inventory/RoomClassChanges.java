package vn.fpt.campusstay.service.inventory;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Inventory public API for the Room Class change of one Room in a coming Term (D-04, spec §6.11), used by Requests
 * once every continuing resident consented: the furniture check, setting the class (the consent replaces the lock
 * of {@code ROOM_CLASS_LOCKED}) with the store items it needs reserved, and setting it back. Also the furniture
 * conformance of Rooms for the turnover (spec §6.11 step 6).
 */
public interface RoomClassChanges {

    /**
     * Furniture of one class-defining type for the change.
     *
     * @param quantity  items to bring in (missing) or take out (extra)
     * @param available items of the type free in the store of the Room's Block (missing only)
     */
    record Need(String typeId, String type, String typeVi, int quantity, int available) {
    }

    /**
     * @param enough   the Block store holds every missing item
     * @param reserved asset codes of the store items planned to move into the Room, once applied
     * @param removing asset codes of the Room's items planned to go to the store, once applied
     */
    record Check(long roomId, String room, long fromClassId, long toClassId, List<Need> missing, List<Need> extra,
            boolean enough, List<String> reserved, List<String> removing) {
    }

    /** The class of the Room in the Term. */
    long classOf(long roomId, long termId);

    /** What the change needs: furniture missing (and what the Block store has) and extra. */
    Check check(long roomId, long termId, long toClassId);

    /**
     * Sets the Room's class from the Term on, reserves the missing items of the Block store (planned moves into the
     * Room) and plans the removal of the extra ones; refuses ({@code 409 FURNITURE_MISSING}) when the store lacks an
     * item. Runs in the caller's transaction; one Audit Log entry.
     *
     * @param reference the request's code, written on the planned moves
     */
    Check apply(long roomId, long termId, long toClassId, long by, String reference);

    /** Sets the Room's class back for the Term and cancels the moves planned for the change. */
    void setBack(long roomId, long termId, long classId, long by, String reference);

    /** Room id → whether its furniture matches its class in the Term. */
    Map<Long, Boolean> conforms(long termId, Collection<Long> roomIds);
}
