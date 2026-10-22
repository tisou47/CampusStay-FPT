package vn.fpt.campusstay.service.maintenance;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.setting.Lookups;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * Admin › Inspection checklists. A checklist is a family of versions addressed by
 * its key ({@code CL-3}); editing a published one publishes the next version and
 * the old one is kept as Replaced, so runs keep the exact version they used.
 */
@Service
public class ChecklistService {

    public record Item(String id, String label, String category, String severity) {
    }

    public record Replaced(int version, int itemCount) {
    }

    /** @param status Active, Draft or Archived */
    public record Checklist(String id, String name, int version, String status, Instant updatedAt,
            Instant archivedAt, List<Item> items, List<Replaced> replaced) {
    }

    public record Page(List<Checklist> items, List<String> categories, List<String> severities) {
    }

    public record Created(String id) {
    }

    public record Published(String id, int version) {
    }

    /** One item as the editor sends it: labels (or codes) of the category and severity. */
    public record ItemInput(String label, String category, String severity) {
    }

    /** A version of a checklist. */
    record Version(long id, String family, String name, int version, String status, Instant updatedAt,
            Instant archivedAt) {
    }

    /** An item of a version; {@code category} and {@code severity} are codes. */
    record VersionItem(long id, long checklistId, String label, String category, String severity) {
    }

    /** Severity codes and labels, the most serious first. */
    static final Map<String, String> SEVERITIES = new LinkedHashMap<>();

    static {
        SEVERITIES.put("CRITICAL", "Critical");
        SEVERITIES.put("MAJOR", "Major");
        SEVERITIES.put("MINOR", "Minor");
        SEVERITIES.put("TRIVIAL", "Trivial");
    }

    private static final Map<String, String> STATUSES = Map.of("PUBLISHED", "Active", "DRAFT", "Draft",
            "ARCHIVED", "Archived", "REPLACED", "Replaced");
    private static final int MAX_ITEMS = 100;

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final Lookups lookups;
    private final AuditLog audit;
    private final Clock clock;

    public ChecklistService(JdbcClient jdbc, CurrentUser currentUser, Lookups lookups, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.lookups = lookups;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Page list() {
        currentUser.require(Permission.CONFIGURE);
        List<Version> versions = jdbc.sql("SELECT * FROM mnt_checklist ORDER BY family_key, version DESC")
                .query(ChecklistService::version).list();
        Map<Long, List<VersionItem>> items = items(versions.stream().map(Version::id).toList());
        Map<String, List<Version>> families = versions.stream()
                .collect(Collectors.groupingBy(Version::family, LinkedHashMap::new, Collectors.toList()));
        List<Checklist> result = new ArrayList<>();
        families.forEach((family, list) -> {
            Version current = list.getFirst();
            result.add(new Checklist(family, current.name(), current.version(), STATUSES.get(current.status()),
                    current.updatedAt(), current.archivedAt(),
                    items.getOrDefault(current.id(), List.of()).stream().map(this::item).toList(),
                    list.stream().filter(v -> v.status().equals("REPLACED"))
                            .map(v -> new Replaced(v.version(), items.getOrDefault(v.id(), List.of()).size()))
                            .toList()));
        });
        result.sort(Comparator.comparing((Checklist c) -> c.status().equals("Archived")).thenComparing(Checklist::name));
        return new Page(result, lookups.list("MAINTENANCE_CATEGORY").stream().map(Lookups.Lookup::label).toList(),
                List.copyOf(SEVERITIES.values()));
    }

    /** A Draft v1 without items. */
    @Transactional
    public Created create(String name) {
        currentUser.require(Permission.CONFIGURE);
        String text = name == null ? "" : name.trim();
        if (text.isEmpty() || text.length() > 150) {
            throw FieldErrors.single("name", "Enter a name of at most 150 characters.");
        }
        boolean taken = jdbc.sql("""
                SELECT count(*) FROM mnt_checklist c
                WHERE lower(c.name) = lower(:name) AND c.status IN ('DRAFT', 'PUBLISHED')
                """).param("name", text).query(Long.class).single() > 0;
        if (taken) {
            throw FieldErrors.single("name", "A checklist with this name already exists.");
        }
        String family = jdbc.sql("""
                WITH next AS (SELECT nextval(pg_get_serial_sequence('mnt_checklist', 'id')) AS id)
                INSERT INTO mnt_checklist (id, family_key, name, version, status, updated_at)
                OVERRIDING SYSTEM VALUE
                SELECT id, 'CL-' || id, :name, 1, 'DRAFT', :now FROM next
                RETURNING family_key
                """).param("name", text).param("now", Timestamp.from(Instant.now(clock))).query(String.class).single();
        audit.record("CHECKLIST_CREATED", AuditLog.Tone.INFO, "Inspection checklist", family, text, null);
        return new Created(family);
    }

    /** A Draft becomes Active; an Active checklist gets the next version and the old one is Replaced. */
    @Transactional
    public Published publish(String id, List<ItemInput> input) {
        currentUser.require(Permission.CONFIGURE);
        Version current = current(id);
        if (current.status().equals("ARCHIVED")) {
            throw ApiException.conflict("CHECKLIST_ARCHIVED", "This checklist is archived.");
        }
        List<ItemInput> items = validate(input);
        Instant now = Instant.now(clock);
        long target;
        int version;
        if (current.status().equals("DRAFT")) {
            jdbc.sql("DELETE FROM mnt_checklist_item WHERE checklist_id = :id").param("id", current.id()).update();
            jdbc.sql("UPDATE mnt_checklist SET status = 'PUBLISHED', published_at = :now, updated_at = :now WHERE id = :id")
                    .param("now", Timestamp.from(now)).param("id", current.id()).update();
            target = current.id();
            version = current.version();
        } else {
            jdbc.sql("UPDATE mnt_checklist SET status = 'REPLACED', updated_at = :now WHERE id = :id")
                    .param("now", Timestamp.from(now)).param("id", current.id()).update();
            version = current.version() + 1;
            target = jdbc.sql("""
                    INSERT INTO mnt_checklist (family_key, name, version, status, published_at, updated_at)
                    VALUES (:family, :name, :version, 'PUBLISHED', :now, :now) RETURNING id
                    """).param("family", current.family()).param("name", current.name()).param("version", version)
                    .param("now", Timestamp.from(now)).query(Long.class).single();
        }
        int order = 0;
        for (ItemInput item : items) {
            jdbc.sql("""
                    INSERT INTO mnt_checklist_item (checklist_id, label, category, severity, sort_order)
                    VALUES (:c, :label, :category, :severity, :order)
                    """).param("c", target).param("label", item.label()).param("category", item.category())
                    .param("severity", item.severity()).param("order", order++).update();
        }
        audit.record("CHECKLIST_PUBLISHED", AuditLog.Tone.SUCCESS, "Inspection checklist", current.family(),
                current.name(), Map.of("version", version, "items", items.size()));
        return new Published(current.family(), version);
    }

    /** Archives the checklist; schedules that use it are paused. */
    @Transactional
    public void archive(String id) {
        currentUser.require(Permission.CONFIGURE);
        Version current = current(id);
        if (current.status().equals("ARCHIVED")) {
            throw ApiException.conflict("CHECKLIST_ARCHIVED", "This checklist is already archived.");
        }
        Instant now = Instant.now(clock);
        jdbc.sql("UPDATE mnt_checklist SET status = 'ARCHIVED', archived_at = :now, updated_at = :now WHERE id = :id")
                .param("now", Timestamp.from(now)).param("id", current.id()).update();
        int paused = jdbc.sql("""
                UPDATE mnt_inspection_schedule SET status = 'PAUSED', version = version + 1
                WHERE checklist_family = :family AND status = 'ACTIVE'
                """).param("family", current.family()).update();
        audit.record("CHECKLIST_ARCHIVED", AuditLog.Tone.WARNING, "Inspection checklist", current.family(),
                current.name(), Map.of("schedulesPaused", paused));
    }

    // ---------------------------------------------------------------- used by inspections

    /** The published version of a checklist family. */
    Optional<Version> published(String family) {
        return jdbc.sql("SELECT * FROM mnt_checklist WHERE family_key = :f AND status = 'PUBLISHED'")
                .param("f", family).query(ChecklistService::version).optional();
    }

    /** Published checklists, by name. */
    List<Version> publishedAll() {
        return jdbc.sql("SELECT * FROM mnt_checklist WHERE status = 'PUBLISHED' ORDER BY name, id")
                .query(ChecklistService::version).list();
    }

    Optional<Version> versionById(long id) {
        return jdbc.sql("SELECT * FROM mnt_checklist WHERE id = :id").param("id", id).query(ChecklistService::version)
                .optional();
    }

    Map<Long, List<VersionItem>> items(List<Long> checklistIds) {
        if (checklistIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql("SELECT * FROM mnt_checklist_item WHERE checklist_id IN (:ids) ORDER BY sort_order, id")
                .param("ids", checklistIds)
                .query((rs, i) -> new VersionItem(rs.getLong("id"), rs.getLong("checklist_id"), rs.getString("label"),
                        rs.getString("category"), rs.getString("severity")))
                .list().stream()
                .collect(Collectors.groupingBy(VersionItem::checklistId, LinkedHashMap::new, Collectors.toList()));
    }

    Item item(VersionItem i) {
        return new Item(String.valueOf(i.id()), i.label(),
                lookups.find("MAINTENANCE_CATEGORY", i.category()).map(Lookups.Lookup::label).orElse(i.category()),
                SEVERITIES.get(i.severity()));
    }

    // ---------------------------------------------------------------- helpers

    /** The family's latest version, locked. */
    private Version current(String id) {
        return jdbc.sql("""
                SELECT * FROM mnt_checklist WHERE upper(family_key) = upper(:f) AND status <> 'REPLACED'
                ORDER BY version DESC LIMIT 1 FOR UPDATE
                """).param("f", id == null ? "" : id.trim()).query(ChecklistService::version).optional()
                .orElseThrow(() -> ApiException.notFound("This checklist does not exist."));
    }

    private List<ItemInput> validate(List<ItemInput> input) {
        if (input == null || input.isEmpty()) {
            throw FieldErrors.single("items", "Add at least one item.");
        }
        if (input.size() > MAX_ITEMS) {
            throw FieldErrors.single("items", "Use at most " + MAX_ITEMS + " items.");
        }
        List<ItemInput> items = new ArrayList<>();
        for (int n = 0; n < input.size(); n++) {
            ItemInput i = input.get(n);
            String label = i == null || i.label() == null ? "" : i.label().trim();
            String category = i == null || i.category() == null ? null
                    : lookups.find("MAINTENANCE_CATEGORY", i.category().trim()).map(Lookups.Lookup::code).orElse(null);
            String severity = i == null || i.severity() == null ? null : SEVERITIES.entrySet().stream()
                    .filter(e -> e.getKey().equalsIgnoreCase(i.severity().trim())
                            || e.getValue().equalsIgnoreCase(i.severity().trim()))
                    .map(Map.Entry::getKey).findFirst().orElse(null);
            if (label.isEmpty() || label.length() > 200) {
                throw FieldErrors.single("items", "Item " + (n + 1) + ": enter a label of at most 200 characters.");
            }
            if (category == null) {
                throw FieldErrors.single("items", "Item " + (n + 1) + ": choose a maintenance category.");
            }
            if (severity == null) {
                throw FieldErrors.single("items", "Item " + (n + 1) + ": choose a severity.");
            }
            items.add(new ItemInput(label, category, severity));
        }
        return items;
    }

    static Version version(ResultSet rs, int i) throws SQLException {
        Timestamp archived = rs.getTimestamp("archived_at");
        return new Version(rs.getLong("id"), rs.getString("family_key"), rs.getString("name"), rs.getInt("version"),
                rs.getString("status"), rs.getTimestamp("updated_at").toInstant(),
                archived == null ? null : archived.toInstant());
    }
}
