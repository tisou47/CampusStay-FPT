package vn.fpt.campusstay.shared.web;

import java.util.List;

/**
 * Contract list shape {@code { items, total }}. Endpoints that add fields next
 * to {@code items} (summary, counts, options) declare their own record with
 * {@code items} and {@code total} as the first two components.
 */
public record ListResponse<T>(List<T> items, long total) {

    public static <T> ListResponse<T> of(List<T> items) {
        return new ListResponse<>(items, items.size());
    }
}
