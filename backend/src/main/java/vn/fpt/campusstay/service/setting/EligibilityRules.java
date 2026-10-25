package vn.fpt.campusstay.service.setting;

import java.util.List;

/**
 * Settings public API: the eligibility criteria the Admin switched on (Admin › Who may apply) and the priority groups.
 * A published Term keeps the switches and the group order it opened with (ADR-20); the methods with a
 * {@code termId} answer for that Term, the others give the rules in use.
 */
public interface EligibilityRules {

    /** {@code key} names the check the applying module runs, e.g. {@code ENROLLED}. */
    record Criterion(String key, String title, String note) {
    }

    /** Switched-on criteria in display order. */
    List<Criterion> enabled();

    /** The criteria the Term opened with (the rules in use while it is a Draft or was published before V42). */
    List<Criterion> enabled(long termId);

    /** Keys of the applied priority groups, highest priority first (the engine's processing order). */
    List<String> priorityGroupKeys();

    /** The priority-group order the Term opened with. */
    List<String> priorityGroupKeys(long termId);
}
