package vn.fpt.campusstay.shared.export;

import java.util.List;
import java.util.Map;

import vn.fpt.campusstay.shared.web.PageQuery;

/**
 * An export of a screen ({@code GET /exports/{report}}). The module that owns the
 * screen implements it with the screen's own query, filters and scope checks; RPT
 * finds it by {@link #report()}, writes the file and the Audit Log entry.
 */
public interface ReportExport {

    /** At most this many rows go into one file. */
    int MAX_ROWS = 10_000;

    /** A page that holds a whole export. */
    PageQuery ALL = new PageQuery(1, MAX_ROWS);

    /** @param fileName without extension, e.g. {@code applications-SP27} */
    record Table(String fileName, List<String> header, List<List<Object>> rows) {
    }

    /** The name in the URL, e.g. {@code applications}. */
    String report();

    /** @param filters the screen's query parameters, as sent */
    Table export(Map<String, String> filters);

    /** A whole-number filter, or null when it is missing or not a number. */
    static Long longFilter(Map<String, String> filters, String key) {
        String value = filters.get(key);
        if (value == null || value.isBlank() || value.length() > 18 || !value.trim().chars().allMatch(Character::isDigit)) {
            return null;
        }
        return Long.parseLong(value.trim());
    }
}
