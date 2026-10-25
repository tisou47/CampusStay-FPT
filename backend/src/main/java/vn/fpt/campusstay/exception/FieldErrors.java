package vn.fpt.campusstay.exception;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Collects business-rule errors per field and throws them as the contract's
 * {@code 400 VALIDATION_FAILED} with {@code details.fields}, the same shape Bean
 * Validation errors have, so forms show each message under its input.
 */
public final class FieldErrors {

    private final Map<String, Object> fields = new LinkedHashMap<>();

    public FieldErrors add(String field, String message) {
        fields.putIfAbsent(field, message);
        return this;
    }

    /** Adds the message unless {@code ok}. */
    public FieldErrors check(boolean ok, String field, String message) {
        return ok ? this : add(field, message);
    }

    public boolean has(String field) {
        return fields.containsKey(field);
    }

    /** The messages collected so far, by field, in the order they were added. */
    public Map<String, String> messages() {
        Map<String, String> result = new LinkedHashMap<>();
        fields.forEach((field, message) -> result.put(field, String.valueOf(message)));
        return result;
    }

    public boolean isEmpty() {
        return fields.isEmpty();
    }

    public void throwIfAny() {
        if (!fields.isEmpty()) {
            throw ApiException.badRequest("VALIDATION_FAILED", "Some fields are not valid. Check the highlighted fields.",
                    Map.of("fields", Collections.unmodifiableMap(new LinkedHashMap<>(fields))));
        }
    }

    /** Shortcut for a single invalid field. */
    public static ApiException single(String field, String message) {
        return ApiException.badRequest("VALIDATION_FAILED", message, Map.of("fields", Map.of(field, message)));
    }
}
