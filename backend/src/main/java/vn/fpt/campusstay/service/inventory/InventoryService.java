package vn.fpt.campusstay.service.inventory;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.Lookups;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.inventory.BedOccupancy;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;

/**
 * Staff and Manager › Inventory: Rooms and Beds of the Blocks in the user's
 * scope, with who holds each Bed in the selected Term, and out-of-service.
 * A Room can go out of service only when no active Allocation holds one of its
 * Beds; its Beds lock first, so a parallel commit cannot slip in.
 */
@Service
public class InventoryService {

    public record BlockFloors(String block, List<Integer> floors) {
    }

    public record Structure(List<BlockFloors> blocks, List<String> outOfServiceReasons) {
    }

    public record Occupant(String name, String studentCode) {
    }

    /** {@code id} is the Bed code, e.g. {@code A-305-B}; {@code state}: allocated, available or oos. */
    public record BedView(String id, String state, Occupant occupant) {
    }

    public record OutOfService(Instant since, String reason, String by, String note) {
    }

    public record RoomView(String code, String block, int floor, String roomTypeName, String roomClassName,
            int capacity, OutOfService outOfService, List<BedView> beds) {
    }

    public record Summary(int beds, int allocated, int available, int outOfService) {
    }

    public record FloorView(String roomClassName, List<RoomView> rooms, Summary summary) {
    }

    public record RoomRef(String code, String block, int floor) {
    }

    private static final String OOS_REASON = "OOS_REASON";

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BedOccupancy occupancy;
    private final UserDirectory users;
    private final TermCatalog terms;
    private final Catalog catalog;
    private final Lookups lookups;
    private final AuditLog audit;
    private final Clock clock;

    public InventoryService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, BedOccupancy occupancy,
            UserDirectory users, TermCatalog terms, Catalog catalog, Lookups lookups, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.occupancy = occupancy;
        this.users = users;
        this.terms = terms;
        this.catalog = catalog;
        this.lookups = lookups;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Structure structure(String block) {
        currentUser.require(Permission.VIEW_INVENTORY);
        BlockSelection selection = blockScope.resolve(block);
        Map<String, List<Integer>> floors = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT b.code, f.floor_no FROM inv_building b LEFT JOIN inv_floor f ON f.building_id = b.id
                WHERE b.id IN (:ids) ORDER BY b.code, f.floor_no
                """)
                .param("ids", List.copyOf(selection.ids()))
                .query((rs, i) -> Map.entry(rs.getString("code"), rs.getObject("floor_no", Integer.class) == null ? -1
                        : rs.getInt("floor_no")))
                .list()
                .forEach(e -> {
                    List<Integer> list = floors.computeIfAbsent(e.getKey(), k -> new ArrayList<>());
                    if (e.getValue() >= 0) {
                        list.add(e.getValue());
                    }
                });
        List<BlockFloors> blocks = new ArrayList<>();
        floors.forEach((code, list) -> blocks.add(new BlockFloors(code, list)));
        return new Structure(blocks, lookups.list(OOS_REASON).stream().map(Lookups.Lookup::label).toList());
    }

    private record RoomRow(long id, String code, long roomTypeId, String status, Instant oosSince, String oosReason,
            String oosNote, Long oosBy) {
    }

    private record BedRow(long id, long roomId, String label, String status) {
    }

    /**
     * @param termId the Term whose Allocations fill the Beds; null = the current Term
     * @param block  blank is allowed only when the user's scope is one Block
     */
    @Transactional(readOnly = true)
    public FloorView floor(Long termId, String block, int floorNo) {
        currentUser.require(Permission.VIEW_INVENTORY);
        BlockSelection selection = blockScope.resolve(block);
        if (!selection.single()) {
            throw ApiException.badRequest("BAD_PARAMETER", "Choose a Block.");
        }
        long buildingId = selection.singleId();
        String blockCode = jdbc.sql("SELECT code FROM inv_building WHERE id = :id").param("id", buildingId)
                .query(String.class).single();
        Long term = termId != null
                ? terms.findPublished(termId).map(TermSummary::id)
                        .orElseThrow(() -> ApiException.notFound("This Term does not exist."))
                : terms.publishedTerms().stream().filter(TermSummary::current).map(TermSummary::id).findFirst()
                        .orElse(null);
        long[] floor = jdbc.sql("SELECT id, room_class_id FROM inv_floor WHERE building_id = :b AND floor_no = :f")
                .param("b", buildingId).param("f", floorNo)
                .query((rs, i) -> new long[] { rs.getLong("id"), rs.getLong("room_class_id") })
                .optional()
                .orElseThrow(() -> ApiException.notFound("Floor " + floorNo + " does not exist in Block " + blockCode + "."));
        String className = catalog.roomClasses().stream().filter(c -> c.id() == floor[1])
                .map(Catalog.RoomClassInfo::name).findFirst().orElse(null);
        Map<Long, String> typeNames = catalog.roomTypes().stream()
                .collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name));

        List<RoomRow> rooms = jdbc.sql("""
                SELECT id, code, room_type_id, status, oos_since, oos_reason, oos_note, oos_by
                FROM inv_room WHERE floor_id = :f AND status <> 'RETIRED' ORDER BY code
                """)
                .param("f", floor[0])
                .query((rs, i) -> {
                    Timestamp since = rs.getTimestamp("oos_since");
                    return new RoomRow(rs.getLong("id"), rs.getString("code"), rs.getLong("room_type_id"),
                            rs.getString("status"), since == null ? null : since.toInstant(), rs.getString("oos_reason"),
                            rs.getString("oos_note"), rs.getObject("oos_by", Long.class));
                })
                .list();
        List<BedRow> beds = jdbc.sql("""
                SELECT b.id, b.room_id, b.label, b.status FROM inv_bed b JOIN inv_room r ON r.id = b.room_id
                WHERE r.floor_id = :f AND r.status <> 'RETIRED' AND b.status <> 'RETIRED'
                ORDER BY b.room_id, b.label
                """)
                .param("f", floor[0])
                .query((rs, i) -> new BedRow(rs.getLong("id"), rs.getLong("room_id"), rs.getString("label"),
                        rs.getString("status")))
                .list();

        Map<Long, Long> occupants = term == null ? Map.of()
                : occupancy.occupants(term, beds.stream().map(BedRow::id).toList());
        Map<Long, UserDirectory.Student> students = users.students(occupants.values());
        Set<Long> setters = new HashSet<>();
        rooms.stream().map(RoomRow::oosBy).filter(Objects::nonNull).forEach(setters::add);
        Map<Long, String> setterNames = users.displayNames(setters);
        Map<String, String> reasons = lookups.list(OOS_REASON).stream()
                .collect(Collectors.toMap(Lookups.Lookup::code, Lookups.Lookup::label));
        Map<Long, List<BedRow>> bedsByRoom = beds.stream().collect(Collectors.groupingBy(BedRow::roomId));

        List<RoomView> views = new ArrayList<>();
        int total = 0, allocated = 0, available = 0, outOfService = 0;
        for (RoomRow room : rooms) {
            boolean roomOos = "OUT_OF_SERVICE".equals(room.status());
            List<BedView> bedViews = new ArrayList<>();
            for (BedRow bed : bedsByRoom.getOrDefault(room.id(), List.of())) {
                Long studentId = occupants.get(bed.id());
                UserDirectory.Student student = studentId == null ? null : students.get(studentId);
                String state = studentId != null ? "allocated"
                        : roomOos || "OUT_OF_SERVICE".equals(bed.status()) ? "oos" : "available";
                bedViews.add(new BedView(room.code() + "-" + bed.label(), state,
                        student == null ? null : new Occupant(student.name(), student.studentCode())));
                total++;
                switch (state) {
                    case "allocated" -> allocated++;
                    case "oos" -> outOfService++;
                    default -> available++;
                }
            }
            OutOfService oos = roomOos
                    ? new OutOfService(room.oosSince(), reasons.getOrDefault(room.oosReason(), room.oosReason()),
                            room.oosBy() == null ? null : setterNames.get(room.oosBy()), room.oosNote())
                    : null;
            views.add(new RoomView(room.code(), blockCode, floorNo, typeNames.get(room.roomTypeId()), className,
                    bedViews.size(), oos, bedViews));
        }
        return new FloorView(className, views, new Summary(total, allocated, available, outOfService));
    }

    /** Where a Room is, for a deep link ({@code ?room=}). */
    @Transactional(readOnly = true)
    public RoomRef room(String code) {
        currentUser.require(Permission.VIEW_INVENTORY);
        Room room = findRoom(code, false);
        blockScope.check(room.buildingId());
        return new RoomRef(room.code(), room.block(), room.floor());
    }

    @Transactional
    public void setOutOfService(String code, String reason, String note) {
        currentUser.require(Permission.SET_ROOM_OUT_OF_SERVICE);
        Room room = findRoom(code, true);
        blockScope.check(room.buildingId());
        Lookups.Lookup why = lookups.find(OOS_REASON, reason)
                .orElseThrow(() -> FieldErrors.single("reason", "Choose a reason from the list."));
        List<Long> bedIds = jdbc.sql("SELECT id FROM inv_bed WHERE room_id = :room ORDER BY id FOR UPDATE")
                .param("room", room.id()).query(Long.class).list();
        int residents = occupancy.bedsInUse(bedIds).size();
        if (residents > 0) {
            throw ApiException.conflict("ROOM_OCCUPIED", "Move the " + residents
                    + (residents == 1 ? " resident" : " residents") + " of Room " + room.code()
                    + " before you set it out of service.");
        }
        if (!"IN_SERVICE".equals(room.status())) {
            throw ApiException.conflict("ROOM_ALREADY_OUT_OF_SERVICE", "Room " + room.code() + " is already out of service.");
        }
        String trimmedNote = note == null || note.isBlank() ? null : note.trim();
        jdbc.sql("""
                UPDATE inv_room SET status = 'OUT_OF_SERVICE', oos_since = :now, oos_reason = :reason, oos_note = :note,
                       oos_by = :by, updated_at = :now, version = version + 1
                WHERE id = :id
                """)
                .param("now", Timestamp.from(Instant.now(clock)))
                .param("reason", why.code())
                .param("note", trimmedNote)
                .param("by", currentUser.id())
                .param("id", room.id())
                .update();
        Map<String, Object> change = new LinkedHashMap<>();
        change.put("reason", why.label());
        if (trimmedNote != null) {
            change.put("note", trimmedNote);
        }
        audit.record("ROOM_OUT_OF_SERVICE", AuditLog.Tone.WARNING, "Room", room.id(), room.code(), change);
    }

    @Transactional
    public void backInService(String code) {
        currentUser.require(Permission.SET_ROOM_OUT_OF_SERVICE);
        Room room = findRoom(code, true);
        blockScope.check(room.buildingId());
        if (!"OUT_OF_SERVICE".equals(room.status())) {
            throw ApiException.conflict("ROOM_IN_SERVICE", "Room " + room.code() + " is already in service.");
        }
        jdbc.sql("""
                UPDATE inv_room SET status = 'IN_SERVICE', oos_since = NULL, oos_reason = NULL, oos_note = NULL,
                       oos_by = NULL, updated_at = :now, version = version + 1
                WHERE id = :id
                """)
                .param("now", Timestamp.from(Instant.now(clock)))
                .param("id", room.id())
                .update();
        audit.record("ROOM_BACK_IN_SERVICE", AuditLog.Tone.SUCCESS, "Room", room.id(), room.code(), null);
    }

    private record Room(long id, String code, long buildingId, String block, int floor, String status) {
    }

    private Room findRoom(String code, boolean lock) {
        return jdbc.sql("""
                SELECT r.id, r.code, r.building_id, b.code AS block, f.floor_no, r.status
                FROM inv_room r JOIN inv_building b ON b.id = r.building_id JOIN inv_floor f ON f.id = r.floor_id
                WHERE upper(r.code) = upper(:code) AND r.status <> 'RETIRED'
                """ + (lock ? " FOR UPDATE OF r" : ""))
                .param("code", code == null ? "" : code.trim())
                .query((rs, i) -> new Room(rs.getLong("id"), rs.getString("code"), rs.getLong("building_id"),
                        rs.getString("block"), rs.getInt("floor_no"), rs.getString("status")))
                .optional()
                .orElseThrow(() -> ApiException.notFound("Room " + code + " does not exist."));
    }
}
