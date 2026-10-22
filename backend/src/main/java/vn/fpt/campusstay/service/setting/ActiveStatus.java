package vn.fpt.campusstay.service.setting;

import java.util.Optional;

/** {@code status} of Room Types and Room Classes; the contract shows {@code Active} / {@code Inactive}. */
public enum ActiveStatus {
    ACTIVE, INACTIVE;

    public String label() {
        return this == ACTIVE ? "Active" : "Inactive";
    }

    /** Blank = Active (new records); anything else must be one of the two labels. */
    public static Optional<ActiveStatus> parse(String label) {
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
