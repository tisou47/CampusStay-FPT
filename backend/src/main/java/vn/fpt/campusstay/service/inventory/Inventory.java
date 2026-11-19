package vn.fpt.campusstay.service.inventory;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Inventory public API: Beds and where they are, for the assignment engine and Allocation screens.
 * <p>A Room's Room Class is set per Term (ADR-24): the methods that take a {@code termId} give each Bed the
 * class of its Room in that Term. The others give the class in the current Term (the published Term whose
 * stay includes today, else the next one to start), or the class the Room was built with when there is no
 * Term; use them only where the class does not matter.
 */
public interface Inventory {

    /**
     * A Bed with its Room and Block.
     *
     * @param gender      {@code M} or {@code F}, the Block's gender
     * @param roomClassId the Room Class of the Bed's Room in the Term asked for
     */
    record BedSlot(long bedId, String bedLabel, long roomId, String roomCode, long buildingId, String block,
            String gender, int floor, long roomTypeId, long roomClassId) {

        /** {@code A-305-B}: the code screens show for a Bed. */
        public String code() {
            return roomCode + "-" + bedLabel;
        }
    }

    /**
     * In-service Beds of in-service Rooms in active Blocks, by Room code then Bed label; only in the Blocks the Term
     * uses and not in the Rooms it leaves out (ADR-20).
     */
    List<BedSlot> assignableBeds(long termId);

    /** Any Beds by id (retired or out of service included), for showing existing Allocations. */
    Map<Long, BedSlot> beds(long termId, Collection<Long> bedIds);

    /** Every non-retired Bed of a Room, by label. */
    List<BedSlot> bedsOfRoom(long termId, long roomId);

    /** Every non-retired Bed of a Block, by Room code then label (Rooms out of service included). */
    List<BedSlot> bedsOfBuilding(long termId, long buildingId);

    /** {@link #beds(long, Collection)} with the Room Class of the current Term. */
    Map<Long, BedSlot> beds(Collection<Long> bedIds);

    /** {@link #bedsOfRoom(long, long)} with the Room Class of the current Term. */
    List<BedSlot> bedsOfRoom(long roomId);

    /** {@link #bedsOfBuilding(long, long)} with the Room Class of the current Term. */
    List<BedSlot> bedsOfBuilding(long buildingId);

    /** {@link #assignableBeds(long)} with the Room Class (and the Blocks and Rooms) of the current Term. */
    List<BedSlot> assignableBeds();

    /**
     * The given Rooms whose door code may be released (spec §6.8): a code is confirmed on the lock and no change is
     * waiting because someone left the Room.
     */
    Set<Long> doorCodeReady(Collection<Long> roomIds);

    /** A furniture item in a Room, for the Maintenance Request form ({@code type} in English, {@code typeVi}). */
    record RoomFurniture(long id, String assetCode, String type, String typeVi) {
    }

    /** The items in the Room that are not disposed, by type then asset code. */
    List<RoomFurniture> furnitureOf(long roomId);

    /**
     * A furniture item of a Room with what the check-in inventory and check-out need.
     *
     * @param personal the item belongs to one Bed ({@code bedId}, null while it is not linked to one)
     * @param status   {@code IN_USE}, {@code BROKEN} or {@code IN_REPAIR}
     */
    record FurnitureLine(long id, String assetCode, long typeId, String type, String typeVi, boolean personal,
            Long bedId, String bedLabel, String status, String condition) {
    }

    /** One Admin condition level with its handover key (Good/Worn/Damaged/Missing) and remaining/loss %. */
    record ConditionLevel(String code, String handoverKey, String name, String nameVi, int remainingPercent,
            int lossPercent) {
    }

    /** The Room's items that are not disposed, shared ones first, then by Bed, type and asset code. */
    List<FurnitureLine> furnitureLines(long roomId);

    /** Furniture type id → the price of one new item (Admin › Furniture types, V75); types without a price are left out. */
    Map<Long, Long> furniturePrices();

    /**
     * The share of an item's price lost in each condition an inspection, an inventory or a check-out records, from
     * the condition levels of Admin › Furniture types (100 − the value the level keeps): {@code GOOD} is Intact,
     * {@code WORN} Partly damaged, {@code DAMAGED} More than half damaged and {@code MISSING} Completely damaged.
     *
     * @return condition → percent of the price (0–100)
     */
    Map<String, Integer> conditionLoss();

    /** The Admin-configured condition levels mapped to handover keys, ordered best first. */
    List<ConditionLevel> conditionLevels();

    /**
     * Plans a move of an item of the type from the Block's store to the Room (a missing item found in an inspection
     * or an inventory). Runs in the caller's transaction. @return the asset code of the planned item, or empty when
     * the store has none free
     */
    Optional<String> planRestock(long roomId, long furnitureTypeId, String reason, long by);
}
