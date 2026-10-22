package vn.fpt.campusstay.security;

import java.util.Set;

/**
 * Result of resolving the {@code block} query parameter against the user's scope.
 * Query with {@code WHERE building_id IN (:ids)} (JdbcClient expands the collection); {@code ids} is never empty.
 */
public record BlockSelection(Set<Long> ids, boolean single) {

    public long singleId() {
        if (!single) {
            throw new IllegalStateException("Selection covers several Blocks");
        }
        return ids.iterator().next();
    }
}
