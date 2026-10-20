package vn.fpt.campusstay.cfg.internal;

import java.util.Optional;

/** {@code status} of Room Types and Room Classes; the contract shows {@code Active} / {@code Inactive}. */
enum ActiveStatus {
    ACTIVE, INACTIVE;

    String label() {
        return this == ACTIVE ? "Active" : "Inactive";
    }

    /** Blank = Active (new records); anything else must be one of the two labels. */
    static Optional<ActiveStatus> parse(String label) {
        if (label == null || label.isBlank()) {
            return Optional.of(ACTIVE);
        }
        for (ActiveStatus s : values()) {
            if (s.name().equalsIgnoreCase(label.trim())) {
                return Optional.of(s);
            }
        }
        return Optional.empty();
    }
}
