package vn.fpt.campusstay.service.auth;

import java.util.Arrays;
import java.util.Optional;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Where a student's directory record stands (ADR-26, spec §6.1): confirmed by the imported student list or a
 * Manager, waiting for a Manager, rejected, or not sent yet by a student who signed up with Google.
 */
public enum Verification {
    VERIFIED("Verified"),
    PENDING("Pending verification"),
    REJECTED("Rejected"),
    NONE("Profile needed");

    private final String label;

    Verification(String label) {
        this.label = label;
    }

    @JsonValue
    public String label() {
        return label;
    }

    /** From {@code auth_student.verification}; a student without a directory record is {@link #NONE}. */
    public static Verification of(String code) {
        return code == null ? NONE : valueOf(code);
    }

    /** By code or label, case-insensitive (list filters send the label they showed). */
    public static Optional<Verification> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        String v = value.trim();
        return Arrays.stream(values()).filter(s -> s.name().equalsIgnoreCase(v) || s.label.equalsIgnoreCase(v))
                .findFirst();
    }
}
