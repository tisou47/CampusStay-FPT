package vn.fpt.campusstay.common.work;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The work waiting for someone in the back office (owner decision 25/11/2026): each feature counts its own open
 * items for the user who asks, and the report feature sums them for the menu badges and the Today list.
 */
public interface WorkSource {

    /** How long before its deadline an item counts as due soon. */
    Duration SOON = Duration.ofHours(24);

    /**
     * A kind of work waiting.
     *
     * @param kind     stable key the web words ({@code maintenance}, {@code payment-claim} …)
     * @param link     the screen that handles it, the path of its menu item
     * @param overdue  items past their deadline; {@code dueSoon} items due within {@link #SOON}
     * @param oldestAt when the oldest item started waiting
     */
    record WorkItem(String kind, String link, long count, long overdue, long dueSoon, Instant oldestAt) {
    }

    /**
     * Who asks: their id, role and the Blocks they work for.
     */
    record Asker(long userId, boolean staff, boolean manager, boolean admin, Set<Long> blockIds) {
    }

    List<WorkItem> work(Asker asker, Instant now);

    /**
     * Counts the rows of {@code rows}, a query giving {@code due} (deadline, may be null) and {@code since} (when it
     * started waiting) per item; empty when nothing waits.
     */
    static Optional<WorkItem> tally(JdbcClient jdbc, String kind, String link, String rows, Map<String, ?> params,
            Instant now) {
        Map<String, Object> p = new HashMap<>(params);
        p.put("now_", Timestamp.from(now));
        p.put("soon_", Timestamp.from(now.plus(SOON)));
        return jdbc.sql("SELECT count(*) AS n, count(*) FILTER (WHERE due < :now_) AS o,"
                + " count(*) FILTER (WHERE due >= :now_ AND due < :soon_) AS s, min(since) AS f FROM (" + rows + ") w")
                .params(p)
                .query((rs, i) -> new WorkItem(kind, link, rs.getLong("n"), rs.getLong("o"), rs.getLong("s"),
                        rs.getTimestamp("f") == null ? null : rs.getTimestamp("f").toInstant()))
                .optional().filter(w -> w.count() > 0);
    }
}
