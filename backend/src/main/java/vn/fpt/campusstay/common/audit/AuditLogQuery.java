package vn.fpt.campusstay.common.audit;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.dto.PageQuery;

/**
 * Read side of the Audit Log (Admin › Audit Log). The table belongs to the
 * shared kernel, so every module reads it through this class.
 */
@Service
@Transactional(readOnly = true)
public class AuditLogQuery {

    /** @param change the JSON stored with the entry, or null */
    public record Entry(long id, Instant at, String actor, String action, AuditLog.Tone tone, String objectType,
            String objectId, String objectLabel, String change) {
    }

    /**
     * @param q      matched against the object and the actor (case-insensitive, contains)
     * @param actor  exact actor label
     * @param action exact action code, e.g. {@code TERM_PUBLISHED}
     * @param role   the actor's role: {@code STUDENT}, {@code STAFF}, {@code MANAGER}, {@code ADMIN}, or
     *               {@code SYSTEM} for jobs; null = any
     * @param since  null = all time
     */
    public record Filter(String q, String actor, String action, String role, Instant since) {
    }

    public record Page(List<Entry> items, long total) {
    }

    private final JdbcClient jdbc;

    public AuditLogQuery(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Page search(Filter filter, PageQuery page) {
        Map<String, Object> params = new LinkedHashMap<>();
        String where = where(filter, params);
        long total = jdbc.sql("SELECT count(*) FROM shared_audit_log" + where).params(params).query(Long.class).single();
        List<Entry> items = jdbc.sql("""
                SELECT id, at, actor_label, action, tone, object_type, object_id, object_label, change::text AS change
                FROM shared_audit_log""" + where + " ORDER BY at DESC, id DESC LIMIT :limit OFFSET :offset")
                .params(params)
                .param("limit", page.limit())
                .param("offset", page.offset())
                .query((rs, i) -> new Entry(rs.getLong("id"), rs.getTimestamp("at").toInstant(),
                        rs.getString("actor_label"), rs.getString("action"), AuditLog.Tone.valueOf(rs.getString("tone")),
                        rs.getString("object_type"), rs.getString("object_id"), rs.getString("object_label"),
                        rs.getString("change")))
                .list();
        return new Page(items, total);
    }

    /** The latest entries about one object (e.g. a user), sign-ins left out, newest first. */
    public List<Entry> about(String objectType, String objectId, int limit) {
        return jdbc.sql("""
                SELECT id, at, actor_label, action, tone, object_type, object_id, object_label, change::text AS change
                FROM shared_audit_log
                WHERE object_type = :type AND object_id = :id AND action NOT IN ('SIGN_IN', 'SIGN_IN_FAILED')
                ORDER BY at DESC, id DESC LIMIT :limit
                """).param("type", objectType).param("id", objectId).param("limit", limit)
                .query((rs, i) -> new Entry(rs.getLong("id"), rs.getTimestamp("at").toInstant(),
                        rs.getString("actor_label"), rs.getString("action"), AuditLog.Tone.valueOf(rs.getString("tone")),
                        rs.getString("object_type"), rs.getString("object_id"), rs.getString("object_label"),
                        rs.getString("change")))
                .list();
    }

    /** Actor labels that appear since the given instant (null = all time), sorted. */
    public List<String> actors(Instant since) {
        return distinct("actor_label", since);
    }

    /** Action codes that appear since the given instant (null = all time), sorted. */
    public List<String> actions(Instant since) {
        return distinct("action", since);
    }

    private List<String> distinct(String column, Instant since) {
        // column is one of two constants above, never user input.
        String sql = "SELECT DISTINCT " + column + " FROM shared_audit_log"
                + (since == null ? "" : " WHERE at >= :since") + " ORDER BY " + column;
        var spec = jdbc.sql(sql);
        if (since != null) {
            spec = spec.param("since", Timestamp.from(since));
        }
        return spec.query(String.class).list();
    }

    /** Builds the WHERE clause from constant fragments; values only travel as parameters. */
    private static String where(Filter filter, Map<String, Object> params) {
        StringBuilder sql = new StringBuilder();
        if (filter.since() != null) {
            append(sql, "at >= :since");
            params.put("since", Timestamp.from(filter.since()));
        }
        if (filter.actor() != null && !filter.actor().isBlank()) {
            append(sql, "actor_label = :actor");
            params.put("actor", filter.actor().trim());
        }
        if (filter.action() != null && !filter.action().isBlank()) {
            append(sql, "action = :action");
            params.put("action", filter.action().trim());
        }
        if (filter.role() != null) {
            if (filter.role().equals("SYSTEM")) {
                append(sql, "actor_id IS NULL");
            } else {
                append(sql, "actor_id IN (SELECT id FROM auth_user WHERE role = :role)");
                params.put("role", filter.role());
            }
        }
        if (filter.q() != null && !filter.q().isBlank()) {
            append(sql, """
                    (object_label ILIKE :q OR actor_label ILIKE :q OR object_type ILIKE :q
                     OR object_id = :qExact)""");
            params.put("q", "%" + escapeLike(filter.q().trim()) + "%");
            params.put("qExact", filter.q().trim());
        }
        return sql.toString();
    }

    private static void append(StringBuilder sql, String condition) {
        sql.append(sql.isEmpty() ? " WHERE " : " AND ").append(condition);
    }

    static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
