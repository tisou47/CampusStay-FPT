package vn.fpt.campusstay.cfg;

import java.time.LocalTime;
import java.util.Optional;

/** CFG public API: what the Block Manager sets for a Block (desk hours and house rules). */
public interface BlockSettings {

    record Settings(LocalTime deskOpens, LocalTime deskCloses, String houseRules) {
    }

    Optional<Settings> forBlock(long buildingId);
}
