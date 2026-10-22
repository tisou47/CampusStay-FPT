package vn.fpt.campusstay.security;

import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonValue;

/** The four actors. Serialized in lower case, as in the API contract. */
public enum Role {
    STUDENT, STAFF, MANAGER, ADMIN;

    /** Spring Security authority name, e.g. {@code ROLE_STAFF}. */
    public String authority() {
        return "ROLE_" + name();
    }

    @JsonValue
    public String json() {
        return name().toLowerCase(Locale.ROOT);
    }

    public boolean isBackOffice() {
        return this != STUDENT;
    }
}
