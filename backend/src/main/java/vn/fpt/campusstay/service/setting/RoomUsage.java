package vn.fpt.campusstay.service.setting;

import java.util.Map;
import java.util.Set;

/**
 * Port implemented by Inventory: how the catalog is used by the inventory, for the
 * Admin screens of Room Types and Room Classes. Settings must not read Inventory tables and
 * Inventory already depends on Settings.
 */
public interface RoomUsage {

    /** @param usedIn Rooms of the class per Block in the current Term, e.g. {@code A 48 · B 24} */
    record ClassUsage(String usedIn, long rooms) {
    }

    /** Room Type id → Rooms of that type (retired Rooms excluded). */
    Map<Long, Long> roomsByType();

    /** Room Types with at least one Bed held by an active Allocation (any Term). */
    Set<Long> roomTypesWithActiveAllocations();

    /** Room Class id → the Rooms that have it in the current Term (each Room's class is set per Term). */
    Map<Long, ClassUsage> usageByClass();
}
