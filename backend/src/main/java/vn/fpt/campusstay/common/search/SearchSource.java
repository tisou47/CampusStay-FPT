package vn.fpt.campusstay.common.search;

import java.util.List;
import java.util.Set;

/**
 * One kind of record the back-office search finds ({@code GET /search}, spec §11.3). The feature that owns the
 * records implements it with its own tables; Reports asks every source and merges the hits.
 */
public interface SearchSource {

    /**
     * A record found.
     *
     * @param kind {@code student}, {@code room}, {@code invoice}, {@code application}, {@code maintenance},
     *             {@code room-change}, {@code swap}, {@code room-class-change} or {@code stay-request}: the web opens
     *             the matching screen
     * @param id   the record's code where it has one ({@code MR-000321}), the student's id, or the Room's code
     */
    record Hit(String kind, String id, String title, String detail) {
    }

    /**
     * Who searches: the Blocks they may see, and whether that is every Block (Managers and the Admin) or only
     * their own (Staff see the students who live in their Blocks).
     */
    record Scope(Set<Long> blockIds, boolean everyBlock) {
    }

    /**
     * At most {@code limit} records matching {@code q} (at least two characters, trimmed): codes from their
     * beginning, names and titles anywhere.
     */
    List<Hit> search(String q, Scope scope, int limit);

    /** {@code q} as an {@code ILIKE} pattern that matches anywhere ({@code %q%}) or from the start ({@code q%}). */
    static String like(String q, boolean anywhere) {
        String escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return (anywhere ? "%" : "") + escaped + "%";
    }
}
