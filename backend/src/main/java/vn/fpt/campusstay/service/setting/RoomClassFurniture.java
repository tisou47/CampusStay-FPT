package vn.fpt.campusstay.service.setting;

import java.util.List;
import java.util.Map;

/**
 * Port implemented by Inventory: the furniture each Room Class requires (review R-05: students see it instead of
 * free-text amenities). Settings must not read Inventory tables and Inventory already depends on Settings.
 */
public interface RoomClassFurniture {

    /** {@code 2 × Desk}: a furniture type with its Vietnamese name and the quantity a Room of the class has. */
    record Line(String type, String typeVi, int quantity) {
    }

    /** Room Class id → its required furniture, in the furniture types' order; classes without any are absent. */
    Map<Long, List<Line>> required();

    default List<Line> required(long roomClassId) {
        return required().getOrDefault(roomClassId, List.of());
    }
}
