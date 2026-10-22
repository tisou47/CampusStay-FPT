package vn.fpt.campusstay.service.setting;

import java.util.List;
import java.util.Optional;

/** Settings public API: option lists ({@code cfg_lookup}), e.g. {@code OOS_REASON}, {@code REGION}. */
public interface Lookups {

    record Lookup(String code, String label) {
    }

    /** Active entries in display order. */
    List<Lookup> list(String listKey);

    /** Finds an active entry by its code or its label (case-insensitive): forms send the label they showed. */
    Optional<Lookup> find(String listKey, String codeOrLabel);
}
