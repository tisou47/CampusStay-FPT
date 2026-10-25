package vn.fpt.campusstay.service.inventory;

import java.util.Collection;
import java.util.List;
import java.util.Map;

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

    /** In-service Beds of in-service Rooms in active Blocks, by Room code then Bed label. */
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

    /** {@link #assignableBeds(long)} with the Room Class of the current Term. */
    List<BedSlot> assignableBeds();
}
