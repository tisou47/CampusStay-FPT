package vn.fpt.campusstay.cfg;

import java.math.BigDecimal;
import java.util.List;

/** CFG public API: Room Types and Room Classes (inactive ones included, flagged). */
public interface Catalog {

    record RoomTypeInfo(long id, String name, int beds, long basePrice, boolean active) {
    }

    record RoomClassInfo(long id, String name, BigDecimal surchargeRate, List<String> amenities, boolean active) {
    }

    /** In display order (sort order, then Beds). */
    List<RoomTypeInfo> roomTypes();

    /** In display order (sort order, then name). */
    List<RoomClassInfo> roomClasses();
}
