package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.util.List;

/** Settings public API: Room Types and Room Classes (inactive ones included, flagged). */
public interface Catalog {

    /** @param mutual the Room Type allows inviting one roommate (2 Beds only) */
    record RoomTypeInfo(long id, String name, int beds, long basePrice, boolean active, String description,
            boolean mutual) {
    }

    record RoomClassInfo(long id, String name, BigDecimal surchargeRate, boolean active) {
    }

    /** In display order (sort order, then Beds). */
    List<RoomTypeInfo> roomTypes();

    /** In display order (sort order, then name). */
    List<RoomClassInfo> roomClasses();
}
