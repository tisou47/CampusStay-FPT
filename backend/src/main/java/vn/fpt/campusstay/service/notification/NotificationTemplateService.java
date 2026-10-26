package vn.fpt.campusstay.service.notification;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * Admin › Notification templates: the in-app and push text of each event. Keys and
 * variables are fixed by the code that sends them; the Admin edits the words and
 * the channels. A test sends the unsaved text to the Admin with sample values.
 */
@Service
public class NotificationTemplateService {

    /** {@code body} is the English text, {@code bodyVi} the Vietnamese one (ADR-25). */
    public record Template(String key, String event, boolean push, boolean inApp, String titleEn, String titleVi,
            String body, String bodyVi, List<String> variables) {
    }

    public record Page(List<Template> items, Map<String, String> sampleValues) {
    }

    /** What the editor sends; null keeps the stored value. */
    public record Change(Boolean push, Boolean inApp, String titleEn, String titleVi, String body, String bodyVi) {
    }

    /** Push messages longer than this are cut by Android; the Admin screen shows the same limit. */
    static final int MAX_PUSH = 160;
    private static final int MAX_BODY = 1000;
    private static final int MAX_TITLE = 200;
    private static final Pattern VAR = Pattern.compile("\\{\\{\\s*([a-zA-Z0-9_]+)\\s*}}");
    /** What the preview and the test show for each variable. */
    private static final Map<String, String> SAMPLES = new LinkedHashMap<>();

    static {
        SAMPLES.put("amount", "1,500,000 VND");
        SAMPLES.put("bed", "B");
        SAMPLES.put("code", "MR-000321");
        SAMPLES.put("decision", "approved");
        SAMPLES.put("dueAt", "05/01/2027 23:59");
        SAMPLES.put("end", "05/01/2027");
        SAMPLES.put("expiresAt", "03/01/2027 12:00");
        SAMPLES.put("from", "02/01/2027");
        SAMPLES.put("fromName", "Nguyen Van An");
        SAMPLES.put("location", "the Block A desk");
        SAMPLES.put("message", "The water will be off on Saturday morning.");
        SAMPLES.put("note", "Please bring your student card.");
        SAMPLES.put("resultsAt", "08/12/2026");
        SAMPLES.put("room", "A-301");
        SAMPLES.put("roomType", "4-bed");
        SAMPLES.put("start", "02/01/2027");
        SAMPLES.put("status", "In progress");
        SAMPLES.put("subject", "Water maintenance on Saturday");
        SAMPLES.put("term", "Spring 2027");
        SAMPLES.put("title", "Shower leaks");
        SAMPLES.put("until", "04/01/2027");
        SAMPLES.put("total", "9,400,000 VND");
        SAMPLES.put("terminateOn", "15/01/2027");
        SAMPLES.put("studentCode", "SE190001");
        SAMPLES.put("requestedFor", "10/01/2027");
        SAMPLES.put("refund", "0 VND");
        SAMPLES.put("reason", "No transfer with this content reached the account.");
        SAMPLES.put("name", "Nguyen Van An");
        SAMPLES.put("moveOutBy", "20/01/2027");
        SAMPLES.put("months", "2");
        SAMPLES.put("debt", "650,000 VND");
        SAMPLES.put("count", "3");
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final PushDispatcher push;
    private final AuditLog audit;
    private final Clock clock;

    public NotificationTemplateService(JdbcClient jdbc, CurrentUser currentUser, PushDispatcher push, AuditLog audit,
            Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.push = push;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Page list() {
        currentUser.require(Permission.CONFIGURE);
        List<Template> items = jdbc.sql("SELECT * FROM ntf_template ORDER BY event, key")
                .query((rs, i) -> template(rs)).list();
        Set<String> used = new TreeSet<>();
        items.forEach(t -> used.addAll(t.variables()));
        Map<String, String> samples = new LinkedHashMap<>();
        used.forEach(v -> samples.put(v, SAMPLES.getOrDefault(v, v)));
        return new Page(items, samples);
    }

    @Transactional
    public Template save(String key, Change change) {
        currentUser.require(Permission.CONFIGURE);
        Template before = find(key, true);
        Template after = merge(before, change);
        jdbc.sql("""
                UPDATE ntf_template SET push = :push, in_app = :inApp, title_en = :titleEn, title_vi = :titleVi,
                       body = :body, body_vi = :bodyVi, updated_at = :now, updated_by = :by
                WHERE key = :key
                """)
                .param("push", after.push()).param("inApp", after.inApp()).param("titleEn", after.titleEn())
                .param("titleVi", after.titleVi()).param("body", after.body()).param("bodyVi", after.bodyVi())
                .param("now", Timestamp.from(Instant.now(clock))).param("by", currentUser.id()).param("key", before.key())
                .update();
        Map<String, Object> diff = new LinkedHashMap<>();
        diff(diff, "push", before.push(), after.push());
        diff(diff, "inApp", before.inApp(), after.inApp());
        diff(diff, "titleEn", before.titleEn(), after.titleEn());
        diff(diff, "titleVi", before.titleVi(), after.titleVi());
        diff(diff, "body", before.body(), after.body());
        diff(diff, "bodyVi", before.bodyVi(), after.bodyVi());
        if (!diff.isEmpty()) {
            audit.record("TEMPLATE_UPDATED", AuditLog.Tone.INFO, "Notification template", before.key(), before.event(),
                    diff);
        }
        return after;
    }

    /** Sends the (unsaved) text to the signed-in Admin, filled with sample values, on the channels it has on. */
    @Transactional
    public void test(String key, Change change) {
        AuthenticatedUser me = currentUser.require(Permission.CONFIGURE);
        Template t = merge(find(key, false), change);
        String title = "[Test] " + Templates.render(t.titleEn(), SAMPLES, false);
        String body = Templates.render(t.body(), SAMPLES, false);
        String titleVi = "[Thử] " + Templates.render(t.titleVi(), SAMPLES, false);
        String bodyVi = Templates.render(t.bodyVi(), SAMPLES, false);
        if (t.push()) {
            boolean vi = Locales.VI.equals(me.locale());
            push.afterCommit(me.userId(), vi ? titleVi : title, vi ? bodyVi : body, null);
        }
        if (t.inApp()) {
            jdbc.sql("""
                    INSERT INTO ntf_notification (user_id, event_key, title, body, title_vi, body_vi, link, created_at)
                    VALUES (:user, :key, :title, :body, :titleVi, :bodyVi, NULL, :now)
                    """).param("user", me.userId()).param("key", t.key()).param("title", cut(title, MAX_TITLE))
                    .param("body", body).param("titleVi", cut(titleVi, MAX_TITLE)).param("bodyVi", bodyVi)
                    .param("now", Timestamp.from(Instant.now(clock))).update();
        }
    }

    // ---------------------------------------------------------------- helpers

    private Template merge(Template t, Change change) {
        Change c = change == null ? new Change(null, null, null, null, null, null) : change;
        Template merged = new Template(t.key(), t.event(), c.push() != null ? c.push() : t.push(),
                c.inApp() != null ? c.inApp() : t.inApp(), c.titleEn() != null ? c.titleEn().trim() : t.titleEn(),
                c.titleVi() != null ? c.titleVi().trim() : t.titleVi(), c.body() != null ? c.body().trim() : t.body(),
                c.bodyVi() != null ? c.bodyVi().trim() : t.bodyVi(), t.variables());
        FieldErrors errors = new FieldErrors();
        errors.check(!merged.titleEn().isEmpty() && merged.titleEn().length() <= MAX_TITLE, "titleEn",
                "Enter a title of at most " + MAX_TITLE + " characters.");
        errors.check(!merged.titleVi().isEmpty() && merged.titleVi().length() <= MAX_TITLE, "titleVi",
                "Enter a title of at most " + MAX_TITLE + " characters.");
        errors.check(!merged.body().isEmpty() && merged.body().length() <= MAX_BODY, "body",
                "Enter a message of at most " + MAX_BODY + " characters.");
        errors.check(!merged.bodyVi().isEmpty() && merged.bodyVi().length() <= MAX_BODY, "bodyVi",
                "Enter a message of at most " + MAX_BODY + " characters.");
        if (!errors.has("body") && merged.push()) {
            errors.check(merged.body().length() <= MAX_PUSH, "body",
                    "Too long for push: " + merged.body().length() + "/" + MAX_PUSH + " characters.");
        }
        if (!errors.has("bodyVi") && merged.push()) {
            errors.check(merged.bodyVi().length() <= MAX_PUSH, "bodyVi",
                    "Too long for push: " + merged.bodyVi().length() + "/" + MAX_PUSH + " characters.");
        }
        unknown(errors, "titleEn", merged.titleEn(), merged.variables());
        unknown(errors, "titleVi", merged.titleVi(), merged.variables());
        unknown(errors, "body", merged.body(), merged.variables());
        unknown(errors, "bodyVi", merged.bodyVi(), merged.variables());
        errors.throwIfAny();
        return merged;
    }

    private static void unknown(FieldErrors errors, String field, String text, List<String> variables) {
        Matcher m = VAR.matcher(text);
        while (m.find()) {
            if (!variables.contains(m.group(1)) && !errors.has(field)) {
                errors.add(field, "{{" + m.group(1) + "}} is not available here. Use " + (variables.isEmpty() ? "no variables"
                        : String.join(", ", variables.stream().map(v -> "{{" + v + "}}").toList())) + ".");
            }
        }
    }

    private Template find(String key, boolean lock) {
        return jdbc.sql("SELECT * FROM ntf_template WHERE key = :key" + (lock ? " FOR UPDATE" : ""))
                .param("key", key == null ? "" : key.trim().toUpperCase(Locale.ROOT))
                .query((rs, i) -> template(rs)).optional()
                .orElseThrow(() -> ApiException.notFound("This notification template does not exist."));
    }

    private static Template template(ResultSet rs) throws SQLException {
        return new Template(rs.getString("key"), rs.getString("event"), rs.getBoolean("push"), rs.getBoolean("in_app"),
                rs.getString("title_en"), rs.getString("title_vi"), rs.getString("body"), rs.getString("body_vi"),
                List.of((String[]) rs.getArray("variables").getArray()));
    }

    private static void diff(Map<String, Object> diff, String field, Object before, Object after) {
        if (!before.equals(after)) {
            diff.put(field, Arrays.asList(before, after));
        }
    }

    private static String cut(String text, int max) {
        return text.length() <= max ? text : text.substring(0, max);
    }
}
