package vn.fpt.campusstay.service.inventory;

import java.util.ArrayList;
import java.util.Comparator;
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

    /**
     * @param use   Personal (one per Bed) or Shared (by the Room)
     * @param price the real price of one item in VND, null while not set
     * @param items items of the type that are not disposed
     */
    public record TypeItem(String id, String code, String name, String nameVi, String category, boolean definesClass,
            String status, String use, Long price, long items) {
    }

    /**
     * {@code conditions}: the condition levels, best first, with the share of the price an item in each is still
     * worth; the Admin sets the shares ({@link #setConditions}).
     */
    public record TypePage(List<TypeItem> items, List<String> categories, List<String> uses,
            List<Condition> conditions) {
    }

    public record Condition(String code, String name, String nameVi, int percent) {
    }

    /** {@code code}: an existing level's, or empty for a new one. */
    public record ConditionValue(String code, String name, String nameVi, Integer percent) {
    }

    public record TypeValues(String code, String name, String nameVi, String category, Boolean definesClass,
            String status, String use, Long price) {
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
    static final Map<String, String> USES = Map.of("PERSONAL", "Personal", "SHARED", "Shared");
    private static final int MAX_QUANTITY = 20;

    /** Condition levels the Room handover maps its conditions to (INV's {@code Inventory.conditionLoss}). */
    private static final List<String> USED_LEVELS = List.of("INTACT", "PARTLY_DAMAGED", "MOSTLY_DAMAGED", "DESTROYED");
    private static final long MAX_PRICE = 1_000_000_000L;

    private record Type(long id, String code, String name, String nameVi, String category, boolean definesClass,
            String status, String use, Long price) {
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
                        t.definesClass(), statusLabel(t.status()), USES.get(t.use()), t.price(),
                        counts.getOrDefault(t.id(), 0L)))
                .toList();
        return new TypePage(items, List.copyOf(CATEGORIES.values()), List.of("Personal", "Shared"), conditions());
    }

    @Transactional
    public long createType(TypeValues values) {
        currentUser.require(Permission.MANAGE_BUILDINGS);
        Valid v = validate(values, null);
        long id = jdbc.sql("""
                INSERT INTO inv_furniture_type (code, name, name_vi, category, defines_class, status, use_scope, unit_price,
                                                sort_order)
                VALUES (:code, :name, :nameVi, :category, :defines, :status, :use, :price,
                        (SELECT coalesce(max(sort_order), 0) + 1 FROM inv_furniture_type))
                RETURNING id
                """)
                .param("code", v.code()).param("name", v.name()).param("nameVi", v.nameVi())
                .param("category", v.category()).param("defines", v.definesClass()).param("status", v.status())
                .param("use", v.use()).param("price", v.price())
                .query(Long.class).single();
        Map<String, Object> created = new LinkedHashMap<>();
        created.put("code", v.code());
        created.put("definesClass", v.definesClass());
        created.put("use", USES.get(v.use()));
        created.put("price", v.price() == null ? "—" : v.price());
        audit.record("FURNITURE_TYPE_CREATED", AuditLog.Tone.INFO, "Furniture type", id, v.name(), created);
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
        put(change, "use", USES.get(before.use()), USES.get(v.use()));
        put(change, "price", before.price() == null ? "—" : before.price(), v.price() == null ? "—" : v.price());
        if (!change.isEmpty()) {
            jdbc.sql("""
                    UPDATE inv_furniture_type SET name = :name, name_vi = :nameVi, category = :category,
                           defines_class = :defines, status = :status, use_scope = :use, unit_price = :price,
                           updated_at = now(), version = version + 1
                    WHERE id = :id
                    """)
                    .param("name", v.name()).param("nameVi", v.nameVi()).param("category", v.category())
                    .param("defines", v.definesClass()).param("status", v.status()).param("use", v.use())
                    .param("price", v.price()).param("id", id)
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

    /**
     * Replaces the condition levels: a level sent with its code is renamed or revalued, one without a code is added,
     * one left out is removed. Each needs its own Vietnamese name (the English one is optional) and a value from 0 to
     * 100 %; at least one stays. They are listed by value, best first.
     */
    @Transactional
    public void setConditions(List<ConditionValue> values) {
        currentUser.require(Permission.MANAGE_BUILDINGS);
        Map<String, Condition> before = conditions().stream()
                .collect(Collectors.toMap(Condition::code, c -> c, (x, y) -> x, LinkedHashMap::new));
        List<ConditionValue> list = values == null ? List.of() : values.stream().filter(Objects::nonNull).toList();
        FieldErrors errors = new FieldErrors();
        errors.check(!list.isEmpty(), "items", "Keep at least one condition level.");
        Set<String> codes = new HashSet<>();
        Set<String> names = new HashSet<>();
        Set<String> namesVi = new HashSet<>();
        List<ConditionValue> clean = new ArrayList<>();
        for (ConditionValue c : list) {
            String code = c.code() == null || c.code().isBlank() ? null : c.code().trim().toUpperCase(Locale.ROOT);
            String nameVi = c.nameVi() == null ? "" : c.nameVi().trim();
            // The English name is optional: a level keeps its own, a new one takes the Vietnamese name.
            String sentName = c.name() == null ? "" : c.name().trim();
            String name = !sentName.isEmpty() ? sentName
                    : code != null && before.containsKey(code) ? before.get(code).name() : nameVi;
            if (code != null && (!before.containsKey(code) || !codes.add(code))) {
                errors.add("items", "This condition level does not exist.");
            } else if (name.isEmpty() || name.length() > 60 || nameVi.isEmpty() || nameVi.length() > 60) {
                errors.add("items", "Enter a name of at most 60 characters.");
            } else if (!names.add(name.toLowerCase(Locale.ROOT)) || !namesVi.add(nameVi.toLowerCase(Locale.ROOT))) {
                errors.add("items", "Give each condition level its own name.");
            } else if (c.percent() == null || c.percent() < 0 || c.percent() > 100) {
                errors.add("items", "Enter a value from 0 to 100 %.");
            }
            if (errors.has("items")) {
                break;
            }
            clean.add(new ConditionValue(code, name, nameVi, c.percent()));
        }
        // Inspections, check-in inventories and check-outs record their conditions on these four levels.
        if (!errors.has("items") && USED_LEVELS.stream().anyMatch(l -> before.containsKey(l) && !codes.contains(l))) {
            errors.add("items", "Keep the first four levels: inspections, check-in inventories and check-outs use them.");
        }
        errors.throwIfAny();
        Map<String, Object> change = new LinkedHashMap<>();
        for (Condition c : before.values()) {
            if (!codes.contains(c.code())) {
                jdbc.sql("DELETE FROM inv_furniture_condition WHERE code = :c").param("c", c.code()).update();
                change.put(c.name(), List.of(c.percent() + " %", "removed"));
            }
        }
        // Best first: by value, ties in the order sent.
        List<ConditionValue> sorted = new ArrayList<>(clean);
        sorted.sort(Comparator.comparing(ConditionValue::percent).reversed());
        int order = 1;
        for (ConditionValue c : sorted) {
            Condition old = c.code() == null ? null : before.get(c.code());
            if (old == null) {
                jdbc.sql("""
                        INSERT INTO inv_furniture_condition (code, name, name_vi, value_percent, sort_order)
                        VALUES (:code, :name, :nameVi, :p, :order)
                        """).param("code", newConditionCode()).param("name", c.name()).param("nameVi", c.nameVi())
                        .param("p", c.percent()).param("order", order).update();
                change.put(c.name(), List.of("added", c.percent() + " %"));
            } else {
                jdbc.sql("""
                        UPDATE inv_furniture_condition SET name = :name, name_vi = :nameVi, value_percent = :p,
                               sort_order = :order, updated_at = now()
                        WHERE code = :code
                        """).param("name", c.name()).param("nameVi", c.nameVi()).param("p", c.percent())
                        .param("order", order).param("code", old.code()).update();
                if (old.percent() != c.percent() || !old.name().equals(c.name()) || !old.nameVi().equals(c.nameVi())) {
                    change.put(c.name(), List.of(old.name() + " " + old.percent() + " %", c.name() + " " + c.percent() + " %"));
                }
            }
            order++;
        }
        if (!change.isEmpty()) {
            audit.record("FURNITURE_CONDITIONS_SET", AuditLog.Tone.INFO, "Furniture condition", null,
                    "Condition levels", change);
        }
    }

    /** LEVEL_1, LEVEL_2, … : the first code no level has. */
    private String newConditionCode() {
        Set<String> taken = new HashSet<>(jdbc.sql("SELECT code FROM inv_furniture_condition").query(String.class).list());
        for (int i = 1; ; i++) {
            if (!taken.contains("LEVEL_" + i)) {
                return "LEVEL_" + i;
            }
        }
    }

    // ---------------------------------------------------------------- helpers

    private List<Condition> conditions() {
        return jdbc.sql("SELECT code, name, name_vi, value_percent FROM inv_furniture_condition ORDER BY value_percent DESC, sort_order")
                .query((rs, i) -> new Condition(rs.getString("code"), rs.getString("name"), rs.getString("name_vi"),
                        rs.getInt("value_percent")))
                .list();
    }

    private record Valid(String code, String name, String nameVi, String category, boolean definesClass, String status,
            String use, Long price) {
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
        // Not sent: an existing type keeps its use; a new one follows its category (furniture belongs to a Bed).
        String sentUse = values.use() == null ? "" : values.use().trim();
        String use = sentUse.isEmpty()
                ? (before != null ? before.use() : "FURNITURE".equals(category) || category == null ? "PERSONAL" : "SHARED")
                : USES.entrySet().stream()
                        .filter(e -> e.getValue().equalsIgnoreCase(sentUse) || e.getKey().equalsIgnoreCase(sentUse))
                        .map(Map.Entry::getKey).findFirst().orElse(null);
        errors.check(use != null, "use", "Choose Personal or Shared.");
        Long price = values.price();
        errors.check(price == null || price >= 0 && price <= MAX_PRICE, "price",
                "Enter a price from 0 to 1,000,000,000 VND.");
        errors.throwIfAny();
        return new Valid(code, name, nameVi, category, Boolean.TRUE.equals(values.definesClass()), status, use, price);
    }

    private List<Type> allTypes() {
        return jdbc.sql("SELECT * FROM inv_furniture_type ORDER BY sort_order, name").query((rs, i) -> type(rs)).list();
    }

    private static Type type(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Type(rs.getLong("id"), rs.getString("code"), rs.getString("name"), rs.getString("name_vi"),
                rs.getString("category"), rs.getBoolean("defines_class"), rs.getString("status"),
                rs.getString("use_scope"), rs.getObject("unit_price", Long.class));
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
