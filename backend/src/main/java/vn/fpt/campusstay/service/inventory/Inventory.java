package vn.fpt.campusstay.service.inventory;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/** Inventory public API: Beds and where they are, for the assignment engine and Allocation screens. */
public interface Inventory {

    /**
     * A Bed with its Room and Block.
     *
     * @param gender      {@code M} or {@code F}, the Block's gender
     * @param roomClassId the Room Class of the Bed's Floor
     */
    record BedSlot(long bedId, String bedLabel, long roomId, String roomCode, long buildingId, String block,
            String gender, int floor, long roomTypeId, long roomClassId) {

        /** {@code A-305-B}: the code screens show for a Bed. */
        public String code() {
            return roomCode + "-" + bedLabel;
        }
    }

    /** In-service Beds of in-service Rooms in active Blocks, by Room code then Bed label. */
    List<BedSlot> assignableBeds();

    /** Any Beds by id (retired or out of service included), for showing existing Allocations. */
    Map<Long, BedSlot> beds(Collection<Long> bedIds);

    /** Every non-retired Bed of a Room, by label. */
    List<BedSlot> bedsOfRoom(long roomId);

    /** Every non-retired Bed of a Block, by Room code then label (Rooms out of service included). */
    List<BedSlot> bedsOfBuilding(long buildingId);
}
