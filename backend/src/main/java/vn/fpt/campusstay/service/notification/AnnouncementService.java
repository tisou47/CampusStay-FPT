package vn.fpt.campusstay.service.notification;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.event.ValueChange;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * Announcements (spec §6.5, D-08): news on the students' board with a category, an audience and a validity. Stored once
 * with a read state per user, never copied per student. Written by the system (a Term published, money or policy
 * changed) or by hand: the Admin and Managers for any audience, Staff for the residents of their Blocks. Students see
 * the ones whose audience includes them, on the board and in the bell.
 */
@Service
public class AnnouncementService {

    /** What a student reads; {@code changes}: the old → new values of a change announcement. */
    public record Item(String id, String category, String title, String body, List<ValueChange> changes, String link,
            boolean pinned, Instant shownFrom, Instant createdAt, boolean read) {
    }

    public record Board(List<Item> items, long unread) {
    }

    public record AdminItem(String id, String category, String audience, List<String> blocks, String termId,
            String term, String title, String body, List<ValueChange> changes, boolean pinned, Instant shownFrom,
            Instant shownUntil, boolean active, String source, String createdBy, Instant createdAt, long reads,
            boolean canEdit) {
    }

    public record AdminList(List<AdminItem> items, long total) {
    }

    public record TermOption(String id, String name) {
    }

    /** What the signed-in user may choose when writing one (Staff: residents of their Blocks only). */
    public record Options(List<String> categories, List<String> audiences, List<String> blocks, List<TermOption> terms) {
    }

    /** {@code audience}: All students, All residents, Residents of Blocks (with {@code blocks}), Applicants of a Term. */
    public record NewAnnouncement(String category, String audience, List<String> blocks, String termId, String title,
            String body, Boolean pinned, Instant shownFrom, Instant shownUntil) {
    }

    /** Pin or unpin, or end it now ({@code end}) or at {@code shownUntil}. */
    public record Change(Boolean pinned, Instant shownUntil, Boolean end) {
    }

    /** A system announcement (NTF listeners). */
    record SystemAnnouncement(String category, String audience, Long termId, Collection<Long> buildingIds,
            String title, String titleVi, String body, String bodyVi, List<ValueChange> changes, String link,
            boolean pinned, Instant shownUntil, String source) {
    }

    static final Map<String, String> CATEGORIES = new LinkedHashMap<>();
    static final Map<String, String> AUDIENCES = new LinkedHashMap<>();
    private static final Map<String, String> SOURCES = Map.of("TERM_PUBLISHED", "Term published", "TERM_CHANGED",
            "Term changed", "POLICY_CHANGED", "Policy changed", "BLOCK_SETTINGS", "Block settings", "MANUAL",
            "Written");

    static {
        CATEGORIES.put("REGISTRATION", "Registration");
        CATEGORIES.put("FINANCE", "Finance");
        CATEGORIES.put("RULES", "Rules");
        CATEGORIES.put("OPERATIONS", "Operations");
        AUDIENCES.put("ALL_STUDENTS", "All students");
        AUDIENCES.put("RESIDENTS", "All residents");
        AUDIENCES.put("BLOCK_RESIDENTS", "Residents of Blocks");
        AUDIENCES.put("TERM_APPLICANTS", "Applicants of a Term");
    }

    private static final int BOARD_SIZE = 20;

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blockDirectory;
    private final TermCatalog terms;
    private final Residences residences;
    private final Applications applications;
    private final UserDirectory users;
    private final AuditLog audit;
    private final Clock clock;

    public AnnouncementService(JdbcClient jdbc, JsonMapper json, CurrentUser currentUser, BlockScope blockScope,
            BlockDirectory blockDirectory, TermCatalog terms, Residences residences, Applications applications,
            UserDirectory users, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.json = json;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blockDirectory = blockDirectory;
        this.terms = terms;
        this.residences = residences;
        this.applications = applications;
        this.users = users;
        this.audit = audit;
        this.clock = clock;
    }

    private record Row(long id, String category, String audience, Long termId, String title, String titleVi,
            String body, String bodyVi, String changes, String link, boolean pinned, Instant shownFrom,
            Instant shownUntil, String source, Long createdBy, Instant createdAt) {
    }

    // ---------------------------------------------------------------- students

    /** The board: pinned first, then the newest, of the announcements shown now whose audience includes the student. */
    @Transactional(readOnly = true)
    public Board board() {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        List<Item> visible = visible(me.userId(), Instant.now(clock));
        List<Item> items = visible.stream()
                .sorted((a, b) -> a.pinned() != b.pinned() ? (a.pinned() ? -1 : 1) : b.createdAt().compareTo(a.createdAt()))
                .limit(BOARD_SIZE)
                .toList();
        return new Board(items, visible.stream().filter(i -> !i.read()).count());
    }

    /** Announcements shown now to the student, newest first, in the request language. */
    @Transactional(readOnly = true)
    List<Item> visible(long studentId, Instant now) {
        List<Row> rows = jdbc.sql("""
                SELECT * FROM ntf_announcement
                WHERE shown_from <= :now AND (shown_until IS NULL OR shown_until > :now)
                ORDER BY created_at DESC, id DESC
                """).param("now", Timestamp.from(now)).query((rs, i) -> row(rs)).list();
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<Long, Set<Long>> blocks = blocksOf(rows.stream().map(Row::id).toList());
        Optional<Residences.Residence> residence = residences.current(studentId);
        Map<Long, Boolean> applied = new HashMap<>();
        Set<Long> read = new HashSet<>(jdbc.sql("""
                SELECT announcement_id FROM ntf_announcement_read WHERE user_id = :user AND announcement_id IN (:ids)
                """).param("user", studentId).param("ids", rows.stream().map(Row::id).toList())
                .query(Long.class).list());
        boolean vi = Locales.VI.equals(Locales.ofRequest());
        List<Item> result = new ArrayList<>();
        for (Row r : rows) {
            boolean shown = switch (r.audience()) {
                case "RESIDENTS" -> residence.isPresent();
                case "BLOCK_RESIDENTS" -> residence.isPresent()
                        && blocks.getOrDefault(r.id(), Set.of()).contains(residence.get().buildingId());
                case "TERM_APPLICANTS" -> residence.map(x -> x.termId() == r.termId()).orElse(false)
                        || applied.computeIfAbsent(r.termId(),
                                t -> applications.live(studentId, t).isPresent());
                default -> true;
            };
            if (shown) {
                result.add(new Item("ann-" + r.id(), CATEGORIES.get(r.category()), vi ? r.titleVi() : r.title(),
                        vi ? r.bodyVi() : r.body(), changes(r.changes()), r.link(), r.pinned(), r.shownFrom(),
                        r.createdAt(), read.contains(r.id())));
            }
        }
        return result;
    }

    /** Marks one announcement read; 404 when it is not shown to the student (or does not exist). */
    @Transactional
    public void markRead(long userId, long announcementId) {
        boolean shown = visible(userId, Instant.now(clock)).stream().anyMatch(i -> i.id().equals("ann-" + announcementId));
        if (!shown) {
            throw ApiException.notFound("This notification does not exist.");
        }
        read(userId, List.of(announcementId));
    }

    @Transactional
    public void markAllRead(long userId) {
        read(userId, visible(userId, Instant.now(clock)).stream().filter(i -> !i.read())
                .map(i -> Long.parseLong(i.id().substring(4))).toList());
    }

    private void read(long userId, List<Long> ids) {
        Timestamp now = Timestamp.from(Instant.now(clock));
        for (long id : ids) {
            jdbc.sql("""
                    INSERT INTO ntf_announcement_read (announcement_id, user_id, read_at) VALUES (:id, :user, :now)
                    ON CONFLICT DO NOTHING
                    """).param("id", id).param("user", userId).param("now", now).update();
        }
    }

    // ---------------------------------------------------------------- back office

    @Transactional(readOnly = true)
    public Options options() {
        AuthenticatedUser me = currentUser.require(Permission.ANNOUNCE);
        boolean staff = me.is(Role.STAFF);
        List<String> blocks = blockDirectory.codesByIds(blockScope.resolve(null).ids()).values().stream().sorted()
                .toList();
        List<TermOption> termOptions = staff ? List.of() : terms.publishedTerms().stream()
                .map(t -> new TermOption(String.valueOf(t.id()), t.name())).toList();
        return new Options(List.copyOf(CATEGORIES.values()),
                staff ? List.of(AUDIENCES.get("BLOCK_RESIDENTS")) : List.copyOf(AUDIENCES.values()), blocks,
                termOptions);
    }

    /** Every announcement, newest first; Staff see the ones for everybody and those of their Blocks. */
    @Transactional(readOnly = true)
    public AdminList list(String q, String category, PageQuery page) {
        AuthenticatedUser me = currentUser.require(Permission.ANNOUNCE);
        Set<Long> scope = blockScope.resolve(null).ids();
        String cat = category == null || category.isBlank() ? null : code(CATEGORIES, category);
        String search = q == null || q.isBlank() ? null : "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
        String where = """
                WHERE (CAST(:cat AS text) IS NULL OR a.category = :cat)
                  AND (CAST(:q AS text) IS NULL OR lower(a.title) LIKE :q OR lower(a.title_vi) LIKE :q)
                  AND (:all OR a.audience <> 'BLOCK_RESIDENTS'
                       OR EXISTS (SELECT 1 FROM ntf_announcement_block b
                                  WHERE b.announcement_id = a.id AND b.building_id IN (:scope)))
                """;
        boolean all = !me.is(Role.STAFF);
        List<Long> scopeIds = scope.isEmpty() ? List.of(-1L) : List.copyOf(scope);
        long total = jdbc.sql("SELECT count(*) FROM ntf_announcement a " + where)
                .param("cat", cat).param("q", search).param("all", all).param("scope", scopeIds)
                .query(Long.class).single();
        List<Row> rows = jdbc.sql("SELECT a.* FROM ntf_announcement a " + where
                        + " ORDER BY a.created_at DESC, a.id DESC LIMIT :limit OFFSET :offset")
                .param("cat", cat).param("q", search).param("all", all).param("scope", scopeIds)
                .param("limit", page.limit()).param("offset", page.offset())
                .query((rs, i) -> row(rs)).list();
        List<Long> ids = rows.stream().map(Row::id).toList();
        Map<Long, Set<Long>> blocks = blocksOf(ids);
        Set<Long> allBlocks = new HashSet<>();
        blocks.values().forEach(allBlocks::addAll);
        Map<Long, String> codes = blockDirectory.codesByIds(allBlocks);
        Map<Long, Long> reads = new HashMap<>();
        if (!ids.isEmpty()) {
            jdbc.sql("""
                    SELECT announcement_id, count(*) AS n FROM ntf_announcement_read WHERE announcement_id IN (:ids)
                    GROUP BY announcement_id
                    """).param("ids", ids)
                    .query((rs, i) -> Map.entry(rs.getLong("announcement_id"), rs.getLong("n"))).list()
                    .forEach(e -> reads.put(e.getKey(), e.getValue()));
        }
        Map<Long, String> names = users.displayNames(rows.stream().map(Row::createdBy).filter(x -> x != null).toList());
        Map<Long, String> termNames = new HashMap<>();
        terms.publishedTerms().forEach(t -> termNames.put(t.id(), t.name()));
        boolean vi = Locales.VI.equals(Locales.ofRequest());
        Instant now = Instant.now(clock);
        List<AdminItem> items = rows.stream()
                .map(r -> new AdminItem(String.valueOf(r.id()), CATEGORIES.get(r.category()), AUDIENCES.get(r.audience()),
                        blocks.getOrDefault(r.id(), Set.of()).stream().map(codes::get).sorted().toList(),
                        r.termId() == null ? null : String.valueOf(r.termId()),
                        r.termId() == null ? null : termNames.get(r.termId()), vi ? r.titleVi() : r.title(),
                        vi ? r.bodyVi() : r.body(), changes(r.changes()), r.pinned(), r.shownFrom(), r.shownUntil(),
                        !r.shownFrom().isAfter(now) && (r.shownUntil() == null || r.shownUntil().isAfter(now)),
                        SOURCES.get(r.source()), r.createdBy() == null ? null : names.get(r.createdBy()), r.createdAt(),
                        reads.getOrDefault(r.id(), 0L), canEdit(me, r, blocks.getOrDefault(r.id(), Set.of()))))
                .toList();
        return new AdminList(items, total);
    }

    @Transactional
    public long create(NewAnnouncement body) {
        AuthenticatedUser me = currentUser.require(Permission.ANNOUNCE);
        FieldErrors errors = new FieldErrors();
        String category = body == null ? null : code(CATEGORIES, body.category());
        String audience = body == null ? null : code(AUDIENCES, body.audience());
        errors.check(category != null, "category", "Choose a category.");
        errors.check(audience != null, "audience", "Choose who reads it.");
        String title = body == null || body.title() == null ? "" : body.title().trim();
        String text = body == null || body.body() == null ? "" : body.body().trim();
        errors.check(!title.isEmpty() && title.length() <= 200, "title", "Write a title of at most 200 characters.");
        errors.check(!text.isEmpty() && text.length() <= 4000, "body", "Write the announcement in at most 4,000 characters.");
        Instant now = Instant.now(clock);
        Instant from = body == null || body.shownFrom() == null ? now : body.shownFrom();
        Instant until = body == null ? null : body.shownUntil();
        errors.check(until == null || until.isAfter(from) && until.isAfter(now), "shownUntil",
                "End it after it starts and after now.");
        Set<Long> blocks = new HashSet<>();
        Long termId = null;
        if ("BLOCK_RESIDENTS".equals(audience)) {
            List<String> codes = body.blocks() == null ? List.of() : body.blocks();
            errors.check(!codes.isEmpty(), "blocks", "Choose at least one Block.");
            for (String c : codes) {
                if (c != null && !c.isBlank()) {
                    blocks.addAll(blockScope.resolve(c).ids());
                }
            }
        } else if ("TERM_APPLICANTS".equals(audience)) {
            termId = parse(body.termId());
            Long chosen = termId;
            errors.check(chosen != null && terms.findPublished(chosen).isPresent(), "termId", "Choose a published Term.");
        }
        if (me.is(Role.STAFF)) {
            errors.check("BLOCK_RESIDENTS".equals(audience), "audience",
                    "Staff write to the residents of their Blocks only.");
        }
        errors.throwIfAny();
        long id = insert(new SystemAnnouncement(category, audience, termId, blocks, title, title, text, text, null, null,
                Boolean.TRUE.equals(body.pinned()), until, "MANUAL"), from, me.userId());
        audit.record("ANNOUNCEMENT_CREATED", AuditLog.Tone.INFO, "Announcement", id, title,
                Map.of("audience", AUDIENCES.get(audience)));
        return id;
    }

    @Transactional
    public void change(long id, Change body) {
        AuthenticatedUser me = currentUser.require(Permission.ANNOUNCE);
        Row r = jdbc.sql("SELECT * FROM ntf_announcement WHERE id = :id FOR UPDATE").param("id", id)
                .query((rs, i) -> row(rs)).optional()
                .orElseThrow(() -> ApiException.notFound("This announcement does not exist."));
        if (!canEdit(me, r, blocksOf(List.of(id)).getOrDefault(id, Set.of()))) {
            throw ApiException.forbidden("FORBIDDEN", "You do not have permission to do this.");
        }
        Instant now = Instant.now(clock);
        Instant until = body != null && Boolean.TRUE.equals(body.end()) ? now : body == null ? null : body.shownUntil();
        boolean pinned = body != null && body.pinned() != null ? body.pinned() : r.pinned();
        if (until != null && !until.isAfter(r.shownFrom())) {
            until = r.shownFrom().plusSeconds(1);
        }
        jdbc.sql("UPDATE ntf_announcement SET pinned = :pinned, shown_until = COALESCE(:until, shown_until) WHERE id = :id")
                .param("pinned", pinned).param("until", until == null ? null : Timestamp.from(until)).param("id", id)
                .update();
        audit.record("ANNOUNCEMENT_CHANGED", AuditLog.Tone.INFO, "Announcement", id, r.title(),
                Map.of("pinned", pinned, "until", until == null ? "—" : until.toString()));
    }

    /** Writes a system announcement in the caller's transaction (a change commits together with its announcement). */
    @Transactional(propagation = Propagation.MANDATORY)
    long publish(SystemAnnouncement a) {
        return insert(a, Instant.now(clock), currentUser.find().map(AuthenticatedUser::userId).orElse(null));
    }

    private long insert(SystemAnnouncement a, Instant from, Long by) {
        long id = jdbc.sql("""
                INSERT INTO ntf_announcement (category, audience, term_id, title, title_vi, body, body_vi, changes, link,
                                              pinned, shown_from, shown_until, source, created_by, created_at)
                VALUES (:category, :audience, :term, :title, :titleVi, :body, :bodyVi, CAST(:changes AS jsonb), :link,
                        :pinned, :from, :until, :source, :by, :now)
                RETURNING id
                """)
                .param("category", a.category()).param("audience", a.audience()).param("term", a.termId())
                .param("title", cut(a.title(), 200)).param("titleVi", cut(a.titleVi(), 200))
                .param("body", cut(a.body(), 4000)).param("bodyVi", cut(a.bodyVi(), 4000))
                .param("changes", a.changes() == null ? null : json.writeValueAsString(a.changes()))
                .param("link", a.link()).param("pinned", a.pinned()).param("from", Timestamp.from(from))
                .param("until", a.shownUntil() == null ? null : Timestamp.from(a.shownUntil()))
                .param("source", a.source()).param("by", by).param("now", Timestamp.from(Instant.now(clock)))
                .query(Long.class).single();
        for (long b : a.buildingIds() == null ? List.<Long>of() : a.buildingIds()) {
            jdbc.sql("INSERT INTO ntf_announcement_block (announcement_id, building_id) VALUES (:a, :b)")
                    .param("a", id).param("b", b).update();
        }
        return id;
    }

    /** Staff change only their own; Managers and the Admin any written by hand or by the system. */
    private static boolean canEdit(AuthenticatedUser me, Row r, Set<Long> blocks) {
        if (me.is(Role.STAFF)) {
            return r.createdBy() != null && r.createdBy() == me.userId() && me.blockIds().containsAll(blocks);
        }
        return true;
    }

    private Map<Long, Set<Long>> blocksOf(List<Long> ids) {
        Map<Long, Set<Long>> result = new HashMap<>();
        if (ids.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT announcement_id, building_id FROM ntf_announcement_block WHERE announcement_id IN (:ids)")
                .param("ids", ids)
                .query((rs, i) -> Map.entry(rs.getLong("announcement_id"), rs.getLong("building_id"))).list()
                .forEach(e -> result.computeIfAbsent(e.getKey(), k -> new HashSet<>()).add(e.getValue()));
        return result;
    }

    private List<ValueChange> changes(String text) {
        return text == null ? null : json.readValue(text, new TypeReference<List<ValueChange>>() {
        });
    }

    private static Row row(java.sql.ResultSet rs) throws java.sql.SQLException {
        long term = rs.getLong("term_id");
        Long termId = rs.wasNull() ? null : term;
        long by = rs.getLong("created_by");
        Long createdBy = rs.wasNull() ? null : by;
        Timestamp until = rs.getTimestamp("shown_until");
        return new Row(rs.getLong("id"), rs.getString("category"), rs.getString("audience"), termId,
                rs.getString("title"), rs.getString("title_vi"), rs.getString("body"), rs.getString("body_vi"),
                rs.getString("changes"), rs.getString("link"), rs.getBoolean("pinned"),
                rs.getTimestamp("shown_from").toInstant(), until == null ? null : until.toInstant(),
                rs.getString("source"), createdBy, rs.getTimestamp("created_at").toInstant());
    }

    /** A label or a code ({@code Residents of Blocks}, {@code BLOCK_RESIDENTS}) → its code, else null. */
    private static String code(Map<String, String> labels, String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.trim();
        return labels.entrySet().stream()
                .filter(e -> e.getKey().equalsIgnoreCase(v) || e.getValue().equalsIgnoreCase(v))
                .map(Map.Entry::getKey).findFirst().orElse(null);
    }

    private static String cut(String text, int max) {
        return text == null || text.length() <= max ? text : text.substring(0, max - 1) + "…";
    }

    private static Long parse(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.valueOf(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
