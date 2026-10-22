package vn.fpt.campusstay.service.inventory;

import java.util.Collection;
import java.util.Map;
import java.util.Set;

/** Inventory public API: facts about Blocks that other modules check (Applications eligibility). */
public interface Buildings {

    /** @param gender {@code M} or {@code F} */
    boolean anyActiveBlockFor(String gender);

    /** Genders ({@code M}, {@code F}) of the given Blocks. */
    Set<String> gendersOf(Collection<Long> buildingIds);

    /** Active Blocks housing the gender, id → code in code order. */
    Map<Long, String> activeBlocksFor(String gender);
}
