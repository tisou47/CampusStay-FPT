package vn.fpt.campusstay.cfg;

import java.util.List;

/** CFG public API: the eligibility criteria the Admin switched on (Admin › Eligibility Rules). */
public interface EligibilityRules {

    /** {@code key} names the check the applying module runs, e.g. {@code ENROLLED}. */
    record Criterion(String key, String title, String note) {
    }

    /** Switched-on criteria in display order. */
    List<Criterion> enabled();

    /** Keys of the applied priority groups, highest priority first (the engine's processing order). */
    List<String> priorityGroupKeys();
}
