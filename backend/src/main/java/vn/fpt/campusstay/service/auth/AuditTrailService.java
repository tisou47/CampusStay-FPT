package vn.fpt.campusstay.service.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.service.auth.AuditLogSettings;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.common.audit.AuditLogQuery;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.dto.PageQuery;

/**
 * Admin › Audit Log: turns stored entries (action codes, JSON changes) into the
 * readable rows of the contract. Action filters accept the label shown on screen.
 */
@Service
public class AuditTrailService {

    public record AuditItem(String id, Instant at, String actor, String action, String tone, String object,
            String change) {
    }

    public record AuditPage(List<AuditItem> items, long total, List<String> actors, List<String> actions,
            int retentionMonths) {
    }

    private final AuditLogQuery query;
    private final AuditLogSettings settings;
    private final JsonMapper json;
    private final Clock clock;

    public AuditTrailService(AuditLogQuery query, AuditLogSettings settings, JsonMapper json, Clock clock) {
        this.query = query;
        this.settings = settings;
        this.json = json;
        this.clock = clock;
    }

    /** @param range {@code 7d}, {@code 30d}, {@code 90d} or {@code all} (blank = all) */
    public AuditPage list(String q, String actor, String action, String range, PageQuery page) {
        Instant since = since(range);
        String actionCode = action == null || action.isBlank() ? null : code(action);
        AuditLogQuery.Page result = query.search(new AuditLogQuery.Filter(q, actor, actionCode, since), page);
        List<AuditItem> items = result.items().stream()
                .map(e -> new AuditItem(String.valueOf(e.id()), e.at(), e.actor(), label(e.action()), tone(e.tone()),
                        object(e), describe(e.change())))
                .toList();
        return new AuditPage(items, result.total(), query.actors(since),
                query.actions(since).stream().map(AuditTrailService::label).toList(), settings.retentionMonths());
    }

    /** The history of one user for the student hub: what was done to the account, newest first. */
    public List<AuditItem> aboutUser(long userId, int limit) {
        return query.about("User", String.valueOf(userId), limit).stream()
                .map(e -> new AuditItem(String.valueOf(e.id()), e.at(), e.actor(), label(e.action()), tone(e.tone()),
                        object(e), describe(e.change())))
                .toList();
    }

    private Instant since(String range) {
        if (range == null || range.isBlank() || range.equals("all")) {
            return null;
        }
        Instant now = Instant.now(clock);
        return switch (range) {
            case "7d" -> now.minus(Duration.ofDays(7));
            case "30d" -> now.minus(Duration.ofDays(30));
            case "90d" -> now.minus(Duration.ofDays(90));
            default -> throw ApiException.badRequest("BAD_PARAMETER", "Choose a date range: 7d, 30d, 90d or all.");
        };
    }

    /** {@code TERM_PUBLISHED} → {@code Term published}. */
    static String label(String code) {
        String text = code.replace('_', ' ').toLowerCase(Locale.ROOT);
        return text.isEmpty() ? text : Character.toUpperCase(text.charAt(0)) + text.substring(1);
    }

    /** Inverse of {@link #label}; an action code is accepted as is. */
    static String code(String label) {
        return label.trim().replace(' ', '_').toUpperCase(Locale.ROOT);
    }

    private static String tone(AuditLog.Tone tone) {
        return tone == AuditLog.Tone.DANGER ? "error" : tone.name().toLowerCase(Locale.ROOT);
    }

    private static String object(AuditLogQuery.Entry e) {
        if (e.objectLabel() != null) {
            return e.objectType() + " " + e.objectLabel();
        }
        return e.objectId() == null ? e.objectType() : e.objectType() + " #" + e.objectId();
    }

    /** {@code {"status": ["Active", "Disabled"], "method": "PASSWORD"}} → {@code status: Active → Disabled; method: PASSWORD}. */
    private String describe(String change) {
        if (change == null) {
            return null;
        }
        Object parsed;
        try {
            parsed = json.readValue(change, Object.class);
        } catch (JacksonException e) {
            return change;
        }
        if (!(parsed instanceof Map<?, ?> map)) {
            return text(parsed);
        }
        List<String> parts = new ArrayList<>();
        map.forEach((key, value) -> parts.add(key + ": " + (value instanceof List<?> pair && pair.size() == 2
                ? text(pair.get(0)) + " → " + text(pair.get(1))
                : text(value))));
        return String.join("; ", parts);
    }

    private static String text(Object value) {
        if (value == null) {
            return "—";
        }
        if (value instanceof List<?> list) {
            return String.join(", ", list.stream().map(AuditTrailService::text).toList());
        }
        return String.valueOf(value);
    }
}
