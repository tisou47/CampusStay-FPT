package vn.fpt.campusstay.service.inventory;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.setting.Catalog;

/**
 * Admin › Furniture (spec §6.19, §9 "Buildings and rooms"): furniture types and the Room Class requirements,
 * i.e. how many items of each class-defining type a Room of each class must have. A type that a class requires
 * keeps "defines Room Class" and stays active; its code (the asset-code prefix) is fixed once created.
 */
@Service
public class AdminFurnitureService {

    /** @param items items of the type that are not disposed */
    public record TypeItem(String id, String code, String name, String nameVi, String category, boolean definesClass,
            String status, long items) {
    }

    public record TypePage(List<TypeItem> items, List<String> categories) {
    }

    public record TypeValues(String code, String name, String nameVi, String category, Boolean definesClass,
            String status) {
    }

    public record Requirement(String typeId, String type, String typeVi, int quantity) {
    }

    public record ClassRequirements(String roomClassId, String roomClass, String status, List<Requirement> requirements) {
    }

    public record TypeOption(String id, String name, String nameVi) {
    }

    public record RequirementPage(List<ClassRequirements> items, List<TypeOption> types) {
    }

    public record RequirementValue(Long typeId, Integer quantity) {
    }

    static final Map<String, String> CATEGORIES = categories();
    private static final int MAX_QUANTITY = 20;

    private record Type(long id, String code, String name, String nameVi, String category, boolean definesClass,
            String status) {
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final Catalog catalog;
    private final AuditLog audit;

    public AdminFurnitureService(JdbcClient jdbc, CurrentUser currentUser, Catalog catalog, AuditLog audit) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.catalog = catalog;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public TypePage types() {
        currentUser.require(Permission.MANAGE_BUILDINGS);
        Map<Long, Long> counts = new HashMap<>();
        jdbc.sql("SELECT furniture_type_id, count(*) AS n FROM inv_furniture_item WHERE status <> 'DISPOSED' GROUP BY 1")
                .query((rs, i) -> Map.entry(rs.getLong(1), rs.getLong(2))).list()
                .forEach(e -> counts.put(e.getKey(), e.getValue()));
        List<TypeItem> items = allTypes().stream()
                .map(t -> new TypeItem(String.valueOf(t.id()), t.code(), t.name(), t.nameVi(), CATEGORIES.get(t.category()),
                        t.definesClass(), statusLabel(t.status()), counts.getOrDefault(t.id(), 0L)))
                .toList();
        return new TypePage(items, List.copyOf(CATEGORIES.values()));
    }

    @Transactional
    public long createType(TypeValues values) {
        currentUser.require(Permission.MANAGE_BUILDINGS);
        Valid v = validate(values, null);
        long id = jdbc.sql("""
                INSERT INTO inv_furniture_type (code, name, name_vi, category, defines_class, status, sort_order)
                VALUES (:code, :name, :nameVi, :category, :defines, :status,
                        (SELECT coalesce(max(sort_order), 0) + 1 FROM inv_furniture_type))
                RETURNING id
                """)
                .param("code", v.code()).param("name", v.name()).param("nameVi", v.nameVi())
                .param("category", v.category()).param("defines", v.definesClass()).param("status", v.status())
                .query(Long.class).single();
        audit.record("FURNITURE_TYPE_CREATED", AuditLog.Tone.INFO, "Furniture type", id, v.name(),
                Map.of("code", v.code(), "definesClass", v.definesClass()));
        return id;
    }

    @Transactional
    public long updateType(long id, TypeValues values) {
        currentUser.require(Permission.MANAGE_BUILDINGS);
        Type before = jdbc.sql("SELECT * FROM inv_furniture_type WHERE id = :id FOR UPDATE").param("id", id)
                .query((rs, i) -> type(rs)).optional()
                .orElseThrow(() -> ApiException.notFound("This furniture type does not exist."));
        Valid v = validate(values, before);
        boolean required = jdbc.sql("SELECT count(*) FROM inv_room_class_requirement WHERE furniture_type_id = :id")
                .param("id", id).query(Long.class).single() > 0;
        if (required && (!v.definesClass() || !"ACTIVE".equals(v.status()))) {
            throw ApiException.conflict("TYPE_REQUIRED", "A Room Class requires " + before.name()
                    + ". Remove it from the Room Class requirements first.");
        }
        Map<String, Object> change = new LinkedHashMap<>();
        put(change, "name", before.name(), v.name());
        put(change, "nameVi", before.nameVi(), v.nameVi());
        put(change, "category", CATEGORIES.get(before.category()), CATEGORIES.get(v.category()));
        put(change, "definesClass", before.definesClass(), v.definesClass());
        put(change, "status", statusLabel(before.status()), statusLabel(v.status()));
        if (!change.isEmpty()) {
            jdbc.sql("""
                    UPDATE inv_furniture_type SET name = :name, name_vi = :nameVi, category = :category,
                           defines_class = :defines, status = :status, updated_at = now(), version = version + 1
                    WHERE id = :id
                    """)
                    .param("name", v.name()).param("nameVi", v.nameVi()).param("category", v.category())
                    .param("defines", v.definesClass()).param("status", v.status()).param("id", id)
                    .update();
            audit.record("FURNITURE_TYPE_UPDATED", AuditLog.Tone.INFO, "Furniture type", id, v.name(), change);
        }
        return id;
    }

    @Transactional(readOnly = true)
    public RequirementPage requirements() {
        currentUser.require(Permission.MANAGE_BUILDINGS);
        Map<Long, Type> types = allTypes().stream().collect(Collectors.toMap(Type::id, t -> t, (a, b) -> a, LinkedHashMap::new));
        Map<Long, List<Requirement>> byClass = new HashMap<>();
        jdbc.sql("""
                SELECT q.room_class_id, q.furniture_type_id, q.quantity FROM inv_room_class_requirement q
                JOIN inv_furniture_type t ON t.id = q.furniture_type_id ORDER BY t.sort_order, t.name
                """)
                .query((rs, i) -> new long[] { rs.getLong(1), rs.getLong(2), rs.getInt(3) }).list()
                .forEach(r -> {
                    Type t = types.get(r[1]);
                    byClass.computeIfAbsent(r[0], k -> new ArrayList<>())
                            .add(new Requirement(String.valueOf(t.id()), t.name(), t.nameVi(), (int) r[2]));
                });
        List<ClassRequirements> items = catalog.roomClasses().stream()
                .map(c -> new ClassRequirements(String.valueOf(c.id()), c.name(), c.active() ? "Active" : "Inactive",
                        byClass.getOrDefault(c.id(), List.of())))
                .toList();
        List<TypeOption> options = types.values().stream().filter(t -> t.definesClass() && "ACTIVE".equals(t.status()))
                .map(t -> new TypeOption(String.valueOf(t.id()), t.name(), t.nameVi())).toList();
        return new RequirementPage(items, options);
    }

    /** Replaces the requirements of the Room Class. */
    @Transactional
    public void setRequirements(long roomClassId, List<RequirementValue> values) {
        currentUser.require(Permission.MANAGE_BUILDINGS);
        Catalog.RoomClassInfo roomClass = catalog.roomClasses().stream().filter(c -> c.id() == roomClassId).findFirst()
                .orElseThrow(() -> ApiException.notFound("This Room Class does not exist."));
        Map<Long, Type> types = allTypes().stream().collect(Collectors.toMap(Type::id, t -> t));
        FieldErrors errors = new FieldErrors();
        List<RequirementValue> list = values == null ? List.of() : values.stream().filter(Objects::nonNull).toList();
        Set<Long> seen = new HashSet<>();
        for (RequirementValue r : list) {
            Type t = r.typeId() == null ? null : types.get(r.typeId());
            if (t == null || !t.definesClass() || !"ACTIVE".equals(t.status())) {
                errors.add("items", "Only active furniture types that define a Room Class can be required.");
            } else if (!seen.add(t.id())) {
                errors.add("items", "List each furniture type once.");
            } else if (r.quantity() == null || r.quantity() < 1 || r.quantity() > MAX_QUANTITY) {
                errors.add("items", "Enter a quantity from 1 to " + MAX_QUANTITY + ".");
            }
        }
        errors.throwIfAny();
        jdbc.sql("DELETE FROM inv_room_class_requirement WHERE room_class_id = :c").param("c", roomClassId).update();
        for (RequirementValue r : list) {
            jdbc.sql("""
                    INSERT INTO inv_room_class_requirement (room_class_id, furniture_type_id, quantity) VALUES (:c, :t, :q)
                    """).param("c", roomClassId).param("t", r.typeId()).param("q", r.quantity()).update();
        }
        String described = list.stream().map(r -> r.quantity() + " × " + types.get(r.typeId()).name())
                .collect(Collectors.joining(", "));
        audit.record("ROOM_CLASS_REQUIREMENTS_SET", AuditLog.Tone.INFO, "Room Class", roomClassId, roomClass.name(),
                Map.of("requirements", described.isEmpty() ? "None" : described));
    }

    // ---------------------------------------------------------------- helpers

    private record Valid(String code, String name, String nameVi, String category, boolean definesClass, String status) {
    }

    private Valid validate(TypeValues values, Type before) {
        FieldErrors errors = new FieldErrors();
        String code = values.code() == null ? "" : values.code().trim().toUpperCase(Locale.ROOT);
        if (before == null) {
            errors.check(code.matches("[A-Z][A-Z0-9]{0,9}"), "code", "Use 1 to 10 letters or digits, starting with a letter.");
            if (!errors.has("code")) {
                errors.check(jdbc.sql("SELECT count(*) FROM inv_furniture_type WHERE code = :code").param("code", code)
                        .query(Long.class).single() == 0, "code", "A furniture type with this code already exists.");
            }
        } else {
            errors.check(code.isEmpty() || code.equals(before.code()), "code", "The code cannot be changed.");
            code = before.code();
        }
        String name = values.name() == null ? "" : values.name().trim();
        errors.check(!name.isEmpty() && name.length() <= 80, "name", "Enter a name of at most 80 characters.");
        if (!errors.has("name")) {
            errors.check(jdbc.sql("SELECT count(*) FROM inv_furniture_type WHERE lower(name) = lower(:name) AND id <> :id")
                    .param("name", name).param("id", before == null ? -1 : before.id()).query(Long.class).single() == 0,
                    "name", "A furniture type with this name already exists.");
        }
        String nameVi = values.nameVi() == null ? "" : values.nameVi().trim();
        errors.check(!nameVi.isEmpty() && nameVi.length() <= 80, "nameVi", "Enter a name of at most 80 characters.");
        String category = CATEGORIES.entrySet().stream()
                .filter(e -> values.category() != null && (e.getValue().equalsIgnoreCase(values.category().trim())
                        || e.getKey().equalsIgnoreCase(values.category().trim())))
                .map(Map.Entry::getKey).findFirst().orElse(null);
        errors.check(category != null, "category", "Choose a category.");
        String status = values.status() == null || values.status().isBlank() ? "ACTIVE"
                : values.status().trim().toUpperCase(Locale.ROOT);
        errors.check(status.equals("ACTIVE") || status.equals("INACTIVE"), "status", "Choose Active or Inactive.");
        errors.throwIfAny();
        return new Valid(code, name, nameVi, category, Boolean.TRUE.equals(values.definesClass()), status);
    }

    private List<Type> allTypes() {
        return jdbc.sql("SELECT * FROM inv_furniture_type ORDER BY sort_order, name").query((rs, i) -> type(rs)).list();
    }

    private static Type type(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Type(rs.getLong("id"), rs.getString("code"), rs.getString("name"), rs.getString("name_vi"),
                rs.getString("category"), rs.getBoolean("defines_class"), rs.getString("status"));
    }

    private static void put(Map<String, Object> change, String key, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            change.put(key, List.of(before, after));
        }
    }

    private static String statusLabel(String status) {
        return "ACTIVE".equals(status) ? "Active" : "Inactive";
    }

    private static Map<String, String> categories() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("APPLIANCE", "Appliance");
        m.put("FURNITURE", "Furniture");
        m.put("FIXTURE", "Fixture");
        m.put("OTHER", "Other");
        return m;
    }
}
