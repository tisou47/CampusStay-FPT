package vn.fpt.campusstay.service.setting;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Port implemented by Inventory: the Blocks, Rooms and Beds a Term can offer, for registration-period requests, the
 * wizard's Rooms and places step and the Term details students read (ADR-20, spec §6.4 step 3). Settings must not
 * read Inventory tables and Inventory already depends on Settings.
 */
public interface TermSupply {

    /** An active Block; {@code gender} {@code M} or {@code F}; Rooms and Beds that are not retired. */
    record Block(long id, String code, String name, String gender, int rooms, int beds) {
    }

    record Room(long id, String code, long buildingId) {
    }

    /**
     * The Beds of one Block × Room Type × Room Class (the Room's class in the Term) that the Term can give: in service,
     * in Rooms in service, in the Blocks it uses and not in the Rooms it leaves out.
     *
     * @param roomsNotMatching Rooms whose furniture does not match their class (spec §6.19)
     */
    record Row(long buildingId, String block, String gender, long roomTypeId, long roomClassId, int rooms, int beds,
            int roomsNotMatching) {
    }

    /** Active Blocks by code. */
    List<Block> blocks();

    /** Rooms (not retired) with the given codes, any case, keyed by upper-case code; unknown codes are left out. */
    Map<String, Room> roomsByCode(Collection<String> codes);

    /** Room codes by id. */
    Map<Long, String> roomCodes(Collection<Long> roomIds);

    /** What the Term offers, by Block code, Room Type and Room Class. */
    List<Row> supply(long termId, TermCatalog.TermRooms rooms);
}
