package vn.fpt.campusstay.cfg;

import java.util.Map;
import java.util.Set;

/**
 * Port implemented by INV: how the catalog is used by the inventory, for the
 * Admin screens of Room Types and Room Classes. CFG must not read INV tables and
 * INV already depends on CFG.
 */
public interface RoomUsage {

    /** @param floors where the Room Class is used, e.g. {@code A 1–2 · B 1–2} */
    record ClassUsage(String floors, long rooms) {
    }

    /** Room Type id → Rooms of that type (retired Rooms excluded). */
    Map<Long, Long> roomsByType();

    /** Room Types with at least one Bed held by an active Allocation (any Term). */
    Set<Long> roomTypesWithActiveAllocations();

    /** Room Class id → Floors and Rooms that use it. */
    Map<Long, ClassUsage> usageByClass();
}
