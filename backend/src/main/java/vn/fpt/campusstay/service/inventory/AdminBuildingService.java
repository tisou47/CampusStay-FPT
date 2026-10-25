package vn.fpt.campusstay.service.inventory;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * Admin › Buildings: Blocks, their Floors and bulk Room generation. The API calls
 * a Block's code its {@code name} ("A"); the database keeps the code and a
 * display name ("Block A").
 * <p>Bulk generation gives each Floor in the range its standard layout: the
 * Floor's own layout if it has one, else the layout and Room Class of the same
 * Floor in the first Block that has it, else that Block's top Floor. It only adds
 * missing Rooms (codes {@code <Block>-<Floor><nn>}), so running it twice is
 * harmless, and it skips Floors where an Allocation holds a Bed.
 * <p>A Room's class is set per Room and per Term (ADR-24, Manager › Room Classes); a
 * Floor's class is only the class bulk generation gives the new Rooms of that Floor.
 */
@Service
public class AdminBuildingService {

    /**
     * @param roomClassName the class new Rooms of the Floor get (null: none chosen yet)
     * @param roomClasses   the classes its Rooms have in the current Term, with how many Rooms have each
     */
    public record FloorRow(int floor, String roomClassName, List<ClassCount> roomClasses, long twoBed, long fourBed,
            long sixBed, long rooms, long beds, long closedRooms) {
    }

    public record ClassCount(String name, long rooms) {
    }

    public record BuildingItem(String id, String name, String gender, String status, List<FloorRow> floors) {
    }

    public record ClassOption(String id, String name) {
    }

    public record BuildingPage(List<BuildingItem> items, List<String> genders, List<Integer> floorOptions,
            List<ClassOption> roomClasses, String layoutNote) {
    }

    public record BlockValues(String name, String gender, String status) {
    }

    public record BulkResult(int created, int skipped) {
    }

    /** {@code roomClassName}: the Room's class in the current Term. */
    public record FloorRoom(String code, String roomTypeName, String roomClassName, boolean outOfService) {
    }

    public record FloorRooms(List<FloorRoom> items) {
    }

    /** Highest Floor number the schema allows ({@code inv_floor.floor_no}). */
    private static final int SCHEMA_MAX_FLOOR = 60;
    private static final Map<String, String> GENDERS = Map.of("M", "Male", "F", "Female");

    private final JdbcClient jdbc;
    private final Catalog catalog;
    private final Parameters parameters;
    private final BedOccupancy occupancy;
    private final TermCatalog terms;
    private final AuditLog audit;

    public AdminBuildingService(JdbcClient jdbc, Catalog catalog, Parameters parameters, BedOccupancy occupancy,
            TermCatalog terms, AuditLog audit) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.parameters = parameters;
        this.occupancy = occupancy;
        this.terms = terms;
        this.audit = audit;
    }

    private record Building(long id, String code, String gender, String status) {
    }

    /** A Floor with its planned layout (Room Type id → Rooms); {@code roomClassId} may be null. */
    private record Floor(long id, long buildingId, String block, int floor, Long roomClassId, Map<Long, Integer> layout) {
    }

    private record Layout(Long roomClassId, Map<Long, Integer> rooms) {
    }

    private record FloorLayoutRow(long floorId, long buildingId, String block, int floor, Long roomClassId,
            Long roomTypeId, int roomCount) {
    }

    @Transactional(readOnly = true)
    public BuildingPage list() {
        Map<Long, Catalog.RoomTypeInfo> types = types();
        Map<Long, String> classNames = classNames();
        Map<Long, Map<Long, long[]>> roomsByFloor = new HashMap<>();
        jdbc.sql("""
                SELECT floor_id, room_type_id, count(*) FILTER (WHERE status <> 'RETIRED') AS rooms,
                       count(*) FILTER (WHERE status = 'OUT_OF_SERVICE') AS closed
                FROM inv_room GROUP BY floor_id, room_type_id
                """)
                .query((rs, i) -> new long[] { rs.getLong("floor_id"), rs.getLong("room_type_id"), rs.getLong("rooms"),
                        rs.getLong("closed") })
                .list()
                .forEach(r -> roomsByFloor.computeIfAbsent(r[0], k -> new HashMap<>()).put(r[1], new long[] { r[2], r[3] }));
        Map<Long, Long> bedsByFloor = new HashMap<>();
        jdbc.sql("""
                SELECT r.floor_id, count(*) AS beds FROM inv_bed b JOIN inv_room r ON r.id = b.room_id
                WHERE b.status <> 'RETIRED' AND r.status <> 'RETIRED' GROUP BY r.floor_id
                """)
                .query((rs, i) -> Map.entry(rs.getLong("floor_id"), rs.getLong("beds")))
                .list()
                .forEach(e -> bedsByFloor.put(e.getKey(), e.getValue()));
        Map<Long, Map<Long, Long>> classesByFloor = new HashMap<>();
        jdbc.sql("""
                SELECT c.floor_id, c.class_id, count(*) AS rooms
                FROM (SELECT floor_id, inv_room_class_in(id, CAST(:term AS BIGINT)) AS class_id
                      FROM inv_room WHERE status <> 'RETIRED') c
                GROUP BY c.floor_id, c.class_id
                """)
                .param("term", currentTerm())
                .query((rs, i) -> new long[] { rs.getLong("floor_id"), rs.getLong("class_id"), rs.getLong("rooms") })
                .list()
                .forEach(r -> classesByFloor.computeIfAbsent(r[0], k -> new TreeMap<>()).put(r[1], r[2]));

        Map<Long, List<Floor>> floorsByBuilding = floors().stream().collect(Collectors.groupingBy(Floor::buildingId));
        List<BuildingItem> items = new ArrayList<>();
        for (Building b : buildings()) {
            List<FloorRow> rows = new ArrayList<>();
            for (Floor f : floorsByBuilding.getOrDefault(b.id(), List.of())) {
                long two = 0, four = 0, six = 0, rooms = 0, closed = 0;
                for (Map.Entry<Long, long[]> e : roomsByFloor.getOrDefault(f.id(), Map.of()).entrySet()) {
                    long count = e.getValue()[0];
                    int beds = types.containsKey(e.getKey()) ? types.get(e.getKey()).beds() : 0;
                    two += beds == 2 ? count : 0;
                    four += beds == 4 ? count : 0;
                    six += beds == 6 ? count : 0;
                    rooms += count;
                    closed += e.getValue()[1];
                }
                List<ClassCount> classes = classesByFloor.getOrDefault(f.id(), Map.of()).entrySet().stream()
                        .map(e -> new ClassCount(classNames.get(e.getKey()), e.getValue())).toList();
                rows.add(new FloorRow(f.floor(), f.roomClassId() == null ? null : classNames.get(f.roomClassId()),
                        classes, two, four, six, rooms, bedsByFloor.getOrDefault(f.id(), 0L), closed));
            }
            items.add(new BuildingItem(String.valueOf(b.id()), b.code(), GENDERS.get(b.gender()), statusLabel(b.status()),
                    rows));
        }
        List<ClassOption> classOptions = catalog.roomClasses().stream().filter(Catalog.RoomClassInfo::active)
                .map(c -> new ClassOption(String.valueOf(c.id()), c.name())).toList();
        return new BuildingPage(items, List.of("Male", "Female"),
                IntStream.rangeClosed(1, maxFloor()).boxed().toList(), classOptions, layoutNote(types));
    }

    @Transactional
    public long create(BlockValues values) {
        FieldErrors errors = new FieldErrors();
        String code = values.name() == null ? "" : values.name().trim().replaceFirst("(?i)^block\\s+", "")
                .toUpperCase(Locale.ROOT);
        errors.check(code.matches("[A-Z0-9]{1,10}"), "name", "Use 1 to 10 letters or digits, e.g. E.");
        if (!errors.has("name")) {
            errors.check(jdbc.sql("SELECT count(*) FROM inv_building WHERE upper(code) = :code").param("code", code)
                    .query(Long.class).single() == 0, "name", "A Block with this name already exists.");
        }
        String gender = gender(values.gender());
        errors.check(gender != null, "gender", "Choose Male or Female.");
        String status = status(values.status());
        errors.check(status != null, "status", "Choose Active or Inactive.");
        errors.throwIfAny();
        long id = jdbc.sql("""
                INSERT INTO inv_building (code, name, gender, status) VALUES (:code, :name, :gender, :status) RETURNING id
                """)
                .param("code", code).param("name", "Block " + code).param("gender", gender).param("status", status)
                .query(Long.class).single();
        audit.record("BLOCK_CREATED", AuditLog.Tone.INFO, "Block", id, code,
                Map.of("gender", GENDERS.get(gender), "status", statusLabel(status)));
        return id;
    }

    /** Gender and status only; a Block's name is fixed. Both are locked while students live there. */
    @Transactional
    public long update(long id, BlockValues values) {
        Building b = lockBuilding(id);
        FieldErrors errors = new FieldErrors();
        if (values.name() != null && !values.name().isBlank()
                && !values.name().trim().replaceFirst("(?i)^block\\s+", "").equalsIgnoreCase(b.code())) {
            errors.add("name", "The Block name cannot be changed.");
        }
        String gender = gender(values.gender());
        errors.check(gender != null, "gender", "Choose Male or Female.");
        String status = status(values.status());
        errors.check(status != null, "status", "Choose Active or Inactive.");
        errors.throwIfAny();
        boolean genderChanges = !gender.equals(b.gender());
        boolean deactivates = "INACTIVE".equals(status) && !"INACTIVE".equals(b.status());
        if ((genderChanges || deactivates) && !occupancy.bedsInUse(bedIds(id)).isEmpty()) {
            throw ApiException.conflict("BLOCK_IN_USE", "Students live in Block " + b.code() + ", so its "
                    + (genderChanges ? "gender cannot change." : "status cannot become Inactive."));
        }
        Map<String, Object> change = new LinkedHashMap<>();
        if (genderChanges) {
            change.put("gender", List.of(GENDERS.get(b.gender()), GENDERS.get(gender)));
        }
        if (!status.equals(b.status())) {
            change.put("status", List.of(statusLabel(b.status()), statusLabel(status)));
        }
        if (!change.isEmpty()) {
            jdbc.sql("""
                    UPDATE inv_building SET gender = :gender, status = :status, updated_at = now(), version = version + 1
                    WHERE id = :id
                    """)
                    .param("gender", gender).param("status", status).param("id", id).update();
            audit.record("BLOCK_UPDATED", AuditLog.Tone.INFO, "Block", id, b.code(), change);
        }
        return id;
    }

    /**
     * @param roomClassId the class of the new Rooms (and the Floors' class for later generations); null keeps
     *                    each Floor's class, or copies the reference Floor's
     */
    @Transactional
    public BulkResult generateRooms(long buildingId, Integer fromFloor, Integer toFloor, Long roomClassId) {
        Building building = lockBuilding(buildingId);
        int max = maxFloor();
        FieldErrors errors = new FieldErrors();
        errors.check(fromFloor != null && fromFloor >= 1 && fromFloor <= max, "fromFloor", "Choose a Floor from 1 to " + max + ".");
        errors.check(toFloor != null && toFloor >= 1 && toFloor <= max, "toFloor", "Choose a Floor from 1 to " + max + ".");
        if (errors.isEmpty()) {
            errors.check(fromFloor <= toFloor, "toFloor", "The last Floor must not be below the first.");
        }
        Optional<Catalog.RoomClassInfo> chosen = roomClassId == null ? Optional.empty()
                : catalog.roomClasses().stream().filter(c -> c.id() == roomClassId && c.active()).findFirst();
        errors.check(roomClassId == null || chosen.isPresent(), "roomClassId", "Choose an active Room Class.");
        errors.throwIfAny();

        Map<Long, Catalog.RoomTypeInfo> types = types();
        List<Floor> floors = floors();
        Map<Integer, Floor> own = floors.stream().filter(f -> f.buildingId() == buildingId)
                .collect(Collectors.toMap(Floor::floor, Function.identity()));
        Map<Long, Long> floorOfBed = new HashMap<>();
        jdbc.sql("SELECT b.id, r.floor_id FROM inv_bed b JOIN inv_room r ON r.id = b.room_id WHERE r.building_id = :id")
                .param("id", buildingId)
                .query((rs, i) -> Map.entry(rs.getLong("id"), rs.getLong("floor_id")))
                .list()
                .forEach(e -> floorOfBed.put(e.getKey(), e.getValue()));
        Set<Long> busyFloors = new HashSet<>();
        occupancy.bedsInUse(floorOfBed.keySet()).forEach(bed -> busyFloors.add(floorOfBed.get(bed)));

        int created = 0;
        int skipped = 0;
        for (int floorNo = fromFloor; floorNo <= toFloor; floorNo++) {
            Floor existing = own.get(floorNo);
            if (existing != null && busyFloors.contains(existing.id())) {
                skipped++;
                continue;
            }
            Layout layout = layoutFor(building, floorNo, existing, floors, types);
            long classId = roomClassId != null ? roomClassId
                    : layout.roomClassId() != null ? layout.roomClassId() : firstActiveClass();
            long floorId;
            if (existing == null) {
                floorId = jdbc.sql("""
                        INSERT INTO inv_floor (building_id, floor_no, room_class_id) VALUES (:b, :f, :c) RETURNING id
                        """)
                        .param("b", buildingId).param("f", floorNo).param("c", classId)
                        .query(Long.class).single();
            } else {
                floorId = existing.id();
                if (existing.roomClassId() == null || existing.roomClassId() != classId) {
                    jdbc.sql("UPDATE inv_floor SET room_class_id = :c WHERE id = :f")
                            .param("c", classId).param("f", floorId).update();
                }
            }
            if (existing == null || existing.layout().isEmpty()) {
                for (Map.Entry<Long, Integer> e : layout.rooms().entrySet()) {
                    jdbc.sql("""
                            INSERT INTO inv_floor_layout (floor_id, room_type_id, room_count) VALUES (:f, :t, :n)
                            ON CONFLICT (floor_id, room_type_id) DO NOTHING
                            """)
                            .param("f", floorId).param("t", e.getKey()).param("n", e.getValue()).update();
                }
            }
            created += createRooms(building, floorId, floorNo, classId, layout.rooms(), types);
        }
        Map<String, Object> change = new LinkedHashMap<>();
        change.put("floors", fromFloor + "–" + toFloor);
        change.put("created", created);
        change.put("skipped", skipped);
        chosen.ifPresent(c -> change.put("roomClass", c.name()));
        audit.record("ROOMS_GENERATED", AuditLog.Tone.INFO, "Block", buildingId, building.code(), change);
        return new BulkResult(created, skipped);
    }

    @Transactional(readOnly = true)
    public FloorRooms floorRooms(long buildingId, int floorNo) {
        Building b = buildings().stream().filter(x -> x.id() == buildingId).findFirst()
                .orElseThrow(() -> ApiException.notFound("This Block does not exist."));
        Floor floor = floors().stream().filter(f -> f.buildingId() == buildingId && f.floor() == floorNo).findFirst()
                .orElseThrow(() -> ApiException.notFound("Floor " + floorNo + " does not exist in Block " + b.code() + "."));
        Map<Long, Catalog.RoomTypeInfo> types = types();
        Map<Long, String> classNames = classNames();
        List<FloorRoom> rooms = jdbc.sql("""
                SELECT code, room_type_id, inv_room_class_in(id, CAST(:term AS BIGINT)) AS room_class_id, status
                FROM inv_room WHERE floor_id = :f AND status <> 'RETIRED' ORDER BY code
                """)
                .param("f", floor.id())
                .param("term", currentTerm())
                .query((rs, i) -> new FloorRoom(rs.getString("code"),
                        Optional.ofNullable(types.get(rs.getLong("room_type_id"))).map(Catalog.RoomTypeInfo::name).orElse(null),
                        classNames.get(rs.getLong("room_class_id")), "OUT_OF_SERVICE".equals(rs.getString("status"))))
                .list();
        return new FloorRooms(rooms);
    }

    // ---------------------------------------------------------------- layout

    private Layout layoutFor(Building building, int floorNo, Floor existing, List<Floor> floors,
            Map<Long, Catalog.RoomTypeInfo> types) {
        Layout layout;
        if (existing != null && !existing.layout().isEmpty()) {
            layout = new Layout(existing.roomClassId(), existing.layout());
        } else {
            Optional<Floor> reference = floors.stream()
                    .filter(f -> f.buildingId() != building.id() && f.floor() == floorNo && !f.layout().isEmpty())
                    .findFirst()
                    .or(() -> referenceTopFloor(floors, building.id()));
            layout = reference.map(f -> new Layout(f.roomClassId(), f.layout()))
                    .orElseGet(() -> defaultLayout(types));
            if (existing != null && existing.roomClassId() != null) {
                layout = new Layout(existing.roomClassId(), layout.rooms());
            }
        }
        Map<Long, Integer> active = new LinkedHashMap<>();
        layout.rooms().forEach((type, count) -> {
            if (types.containsKey(type) && types.get(type).active() && count > 0) {
                active.put(type, count);
            }
        });
        return new Layout(layout.roomClassId(), active);
    }

    /** The top Floor with a layout in the first Block (by code) that has one, other than the given Block. */
    private static Optional<Floor> referenceTopFloor(List<Floor> floors, long excludedBuildingId) {
        return floors.stream()
                .filter(f -> f.buildingId() != excludedBuildingId && !f.layout().isEmpty())
                .min(Comparator.comparing(Floor::block).thenComparing(Floor::floor, Comparator.reverseOrder()));
    }

    /** No layout anywhere yet: one Room of every active Room Type, first active Room Class. */
    private Layout defaultLayout(Map<Long, Catalog.RoomTypeInfo> types) {
        long classId = firstActiveClass();
        Map<Long, Integer> rooms = new LinkedHashMap<>();
        types.values().stream().filter(Catalog.RoomTypeInfo::active).forEach(t -> rooms.put(t.id(), 1));
        if (rooms.isEmpty()) {
            throw ApiException.conflict("NO_ROOM_TYPE", "Create an active Room Type first.");
        }
        return new Layout(classId, rooms);
    }

    private long firstActiveClass() {
        return catalog.roomClasses().stream().filter(Catalog.RoomClassInfo::active).findFirst()
                .map(Catalog.RoomClassInfo::id)
                .orElseThrow(() -> ApiException.conflict("NO_ROOM_CLASS", "Create an active Room Class first."));
    }

    /** Adds the missing Rooms of the layout, numbered by Room Type (fewest Beds first); returns how many. */
    private int createRooms(Building building, long floorId, int floorNo, long roomClassId, Map<Long, Integer> layout,
            Map<Long, Catalog.RoomTypeInfo> types) {
        List<Long> typeOrder = layout.keySet().stream()
                .sorted(Comparator.comparing((Long t) -> types.get(t).beds()).thenComparing(t -> t))
                .toList();
        int total = layout.values().stream().mapToInt(Integer::intValue).sum();
        int created = 0;
        int seq = 0;
        for (long type : typeOrder) {
            for (int k = 0; k < layout.get(type); k++) {
                seq++;
                String code = building.code() + "-" + floorNo + String.format(total > 99 ? "%03d" : "%02d", seq);
                Optional<Long> roomId = jdbc.sql("""
                        INSERT INTO inv_room (code, building_id, floor_id, room_type_id, room_class_id)
                        VALUES (:code, :b, :f, :t, :c)
                        ON CONFLICT (code) DO NOTHING RETURNING id
                        """)
                        .param("code", code).param("b", building.id()).param("f", floorId).param("t", type)
                        .param("c", roomClassId)
                        .query(Long.class).optional();
                if (roomId.isPresent()) {
                    jdbc.sql("""
                            INSERT INTO inv_bed (room_id, label) SELECT :room, chr(64 + s.n) FROM generate_series(1, :beds) AS s(n)
                            """)
                            .param("room", roomId.get()).param("beds", types.get(type).beds()).update();
                    created++;
                }
            }
        }
        return created;
    }

    private String layoutNote(Map<Long, Catalog.RoomTypeInfo> types) {
        Optional<Floor> reference = referenceTopFloor(floors(), -1);
        if (reference.isEmpty()) {
            return "No Floor has a layout yet, so each new Floor gets one Room of every active Room Type. "
                    + "Existing Rooms are kept and Floors with Allocations are skipped.";
        }
        String rooms = reference.get().layout().entrySet().stream()
                .filter(e -> types.containsKey(e.getKey()))
                .sorted(Comparator.comparing(e -> types.get(e.getKey()).beds()))
                .map(e -> e.getValue() + " × " + types.get(e.getKey()).name())
                .collect(Collectors.joining(", "));
        return "A Floor keeps its own layout; a new Floor copies the layout and Room Class of the same Floor in Block "
                + reference.get().block() + ", e.g. " + rooms + ". Missing Rooms are added as <Block>-<Floor><nn>; "
                + "existing Rooms are kept and Floors with Allocations are skipped.";
    }

    // ---------------------------------------------------------------- queries

    private List<Building> buildings() {
        return jdbc.sql("SELECT id, code, gender, status FROM inv_building ORDER BY code")
                .query((rs, i) -> new Building(rs.getLong("id"), rs.getString("code"), rs.getString("gender").trim(),
                        rs.getString("status")))
                .list();
    }

    private Building lockBuilding(long id) {
        return jdbc.sql("SELECT id, code, gender, status FROM inv_building WHERE id = :id FOR UPDATE")
                .param("id", id)
                .query((rs, i) -> new Building(rs.getLong("id"), rs.getString("code"), rs.getString("gender").trim(),
                        rs.getString("status")))
                .optional()
                .orElseThrow(() -> ApiException.notFound("This Block does not exist."));
    }

    /** Every Floor with its layout, in Block code then Floor order. */
    private List<Floor> floors() {
        List<FloorLayoutRow> rows = jdbc.sql("""
                SELECT f.id, f.building_id, b.code, f.floor_no, f.room_class_id, l.room_type_id, l.room_count
                FROM inv_floor f JOIN inv_building b ON b.id = f.building_id
                LEFT JOIN inv_floor_layout l ON l.floor_id = f.id
                ORDER BY b.code, f.floor_no, l.room_type_id
                """)
                .query((rs, i) -> new FloorLayoutRow(rs.getLong("id"), rs.getLong("building_id"), rs.getString("code"),
                        rs.getInt("floor_no"), rs.getObject("room_class_id", Long.class),
                        rs.getObject("room_type_id", Long.class), rs.getInt("room_count")))
                .list();
        Map<Long, Floor> floors = new LinkedHashMap<>();
        for (FloorLayoutRow r : rows) {
            Floor floor = floors.computeIfAbsent(r.floorId(), k -> new Floor(r.floorId(), r.buildingId(), r.block(),
                    r.floor(), r.roomClassId(), new LinkedHashMap<>()));
            if (r.roomTypeId() != null) {
                floor.layout().put(r.roomTypeId(), r.roomCount());
            }
        }
        return List.copyOf(floors.values());
    }

    private List<Long> bedIds(long buildingId) {
        return jdbc.sql("SELECT b.id FROM inv_bed b JOIN inv_room r ON r.id = b.room_id WHERE r.building_id = :id")
                .param("id", buildingId).query(Long.class).list();
    }

    private Long currentTerm() {
        return terms.publishedTerms().stream().filter(TermSummary::current).map(TermSummary::id).findFirst()
                .orElse(null);
    }

    private Map<Long, Catalog.RoomTypeInfo> types() {
        return catalog.roomTypes().stream()
                .collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Function.identity(), (a, b) -> a, LinkedHashMap::new));
    }

    private Map<Long, String> classNames() {
        return catalog.roomClasses().stream()
                .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name));
    }

    private int maxFloor() {
        return Math.max(1, Math.min(parameters.intValue("inventory.max_floor"), SCHEMA_MAX_FLOOR));
    }

    private static String gender(String value) {
        if (value == null) {
            return null;
        }
        String v = value.trim();
        return GENDERS.entrySet().stream()
                .filter(e -> e.getKey().equalsIgnoreCase(v) || e.getValue().equalsIgnoreCase(v))
                .map(Map.Entry::getKey).findFirst().orElse(null);
    }

    private static String status(String value) {
        if (value == null || value.isBlank()) {
            return "ACTIVE";
        }
        String v = value.trim().toUpperCase(Locale.ROOT);
        return v.equals("ACTIVE") || v.equals("INACTIVE") ? v : null;
    }

    private static String statusLabel(String status) {
        return "ACTIVE".equals(status) ? "Active" : "Inactive";
    }
}
