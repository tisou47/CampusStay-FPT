package vn.fpt.campusstay.service.inventory;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * Manager › Room Classes (ADR-24, spec D-03): the Room Class of every Room per Term, with its furniture
 * conformance. A class is set for a Term whose stay has not started and keeps for later Terms until another
 * one is set ({@code inv_room_class_in}, V38). The economic rule: a Room whose Beds are already promised in
 * that Term or a later one (an active Allocation, a live assignment run, a held Round-2 option) keeps its
 * class there, because its price is fixed; the change applies from a later Term, so no price gap or refund
 * ever arises. The consent of continuing residents (D-04) comes with the requests window (phase 6).
 */
@Service
public class RoomClassService {

    public record TermOption(String id, String name, LocalDate stayStart, boolean current, boolean editable) {
    }

    /** Items of one furniture type: {@code type} English, {@code typeVi} Vietnamese. */
    public record ItemCount(String typeId, String type, String typeVi, int quantity) {
    }

    /** {@code status}: Matches or Does not match. */
    public record Conformance(String status, List<ItemCount> missing, List<ItemCount> extra) {
    }

    /**
     * @param previousClass the Room's class in the Term before (or the class it was built with)
     * @param setForTerm    the class was set for this very Term
     * @param locked        Beds of the Room are promised in this Term or later, so its class cannot change here
     */
    public record RoomRow(String room, String block, int floor, String roomType, String roomClassId, String roomClass,
            String previousClass, boolean setForTerm, boolean locked, Conformance conformance) {
    }

    public record ClassCount(String roomClassId, String roomClass, long rooms) {
    }

    public record ClassOption(String id, String name) {
    }

    public record RoomClassPage(TermOption term, List<TermOption> terms, List<RoomRow> items, long total,
            List<ClassCount> summary, List<ClassOption> roomClasses, List<String> blocks, String note) {
    }

    public record Changed(int changed, int unchanged) {
    }

    private static final int MAX_ROOMS = 1000;

    private record Room(long id, String code, long buildingId, String block, int floor, long typeId, long classId,
            long previousClassId, boolean setForTerm) {
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blocks;
    private final TermCatalog terms;
    private final Catalog catalog;
    private final BedOccupancy occupancy;
    private final RoomConformance conformance;
    private final AuditLog audit;
    private final Clock clock;

    public RoomClassService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, BlockDirectory blocks,
            TermCatalog terms, Catalog catalog, BedOccupancy occupancy, RoomConformance conformance, AuditLog audit,
            Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blocks = blocks;
        this.terms = terms;
        this.catalog = catalog;
        this.occupancy = occupancy;
        this.conformance = conformance;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * @param termId      null = the next Term to start (else the current one)
     * @param roomClassId only Rooms of this class in the Term
     * @param match       {@code Matches} or {@code Does not match}
     */
    @Transactional(readOnly = true)
    public RoomClassPage list(Long termId, String block, Integer floor, Long roomClassId, String match, String q,
            PageQuery page) {
        currentUser.require(Permission.VIEW_INVENTORY);
        BlockSelection scope = blockScope.resolve(block);
        List<TermSummary> published = terms.publishedTerms();
        List<TermOption> options = published.stream().sorted(Comparator.comparing(TermSummary::stayStart))
                .map(this::option).toList();
        Map<Long, String> classNames = classNames();
        List<ClassOption> classOptions = catalog.roomClasses().stream().filter(Catalog.RoomClassInfo::active)
                .map(c -> new ClassOption(String.valueOf(c.id()), c.name())).toList();
        List<String> blockCodes = List.copyOf(blocks.codesByIds(scope.ids()).values().stream().sorted().toList());
        Optional<TermSummary> chosen = termId != null
                ? Optional.of(terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist.")))
                : published.stream().filter(t -> t.stayStart().isAfter(today()))
                        .min(Comparator.comparing(TermSummary::stayStart))
                        .or(() -> published.stream().filter(TermSummary::current).findFirst());
        if (chosen.isEmpty()) {
            return new RoomClassPage(null, options, List.of(), 0, List.of(), classOptions, blockCodes,
                    "Publish a Term first: Room Classes are set per Term.");
        }
        TermSummary term = chosen.get();
        Long previousTerm = published.stream().filter(t -> t.stayStart().isBefore(term.stayStart()))
                .max(Comparator.comparing(TermSummary::stayStart)).map(TermSummary::id).orElse(null);

        List<Room> rooms = rooms(term.id(), previousTerm, scope.ids(), floor, q);
        Map<Long, Conformance> conformances = conformance.of(rooms.stream()
                .collect(Collectors.toMap(Room::id, Room::classId)));
        List<Room> shown = rooms.stream()
                .filter(r -> roomClassId == null || r.classId() == roomClassId)
                .filter(r -> match == null || match.isBlank() || conformances.get(r.id()).status().equalsIgnoreCase(match.trim()))
                .toList();
        Map<Long, Long> perClass = new LinkedHashMap<>();
        shown.forEach(r -> perClass.merge(r.classId(), 1L, Long::sum));
        List<ClassCount> summary = catalog.roomClasses().stream().filter(c -> perClass.containsKey(c.id()))
                .map(c -> new ClassCount(String.valueOf(c.id()), c.name(), perClass.get(c.id()))).toList();

        List<Room> pageRooms = shown.stream().skip(page.offset()).limit(page.limit()).toList();
        Set<Long> lockedRooms = lockedRooms(term, published, pageRooms);
        Map<Long, String> typeNames = catalog.roomTypes().stream()
                .collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name));
        List<RoomRow> items = pageRooms.stream()
                .map(r -> new RoomRow(r.code(), r.block(), r.floor(), typeNames.get(r.typeId()),
                        String.valueOf(r.classId()), classNames.get(r.classId()), classNames.get(r.previousClassId()),
                        r.setForTerm(), lockedRooms.contains(r.id()), conformances.get(r.id())))
                .toList();
        TermOption termOption = option(term);
        String note = termOption.editable() ? null
                : "The stay of " + term.name() + " has started, so its Room Classes are fixed.";
        return new RoomClassPage(termOption, options, items, shown.size(), summary, classOptions, blockCodes, note);
    }

    /** Sets the class of the Rooms for the Term (and the later Terms that do not set their own). */
    @Transactional
    public Changed set(Long termId, List<String> roomCodes, Long roomClassId) {
        currentUser.require(Permission.MANAGE_ROOM_CLASSES);
        FieldErrors errors = new FieldErrors();
        errors.check(termId != null, "termId", "Choose a Term.");
        Set<String> codes = roomCodes == null ? Set.of() : roomCodes.stream().filter(Objects::nonNull).map(String::trim)
                .filter(s -> !s.isEmpty()).map(s -> s.toUpperCase(Locale.ROOT))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        errors.check(!codes.isEmpty(), "rooms", "Choose at least one Room.");
        errors.check(codes.size() <= MAX_ROOMS, "rooms", "Choose at most " + MAX_ROOMS + " Rooms at a time.");
        Optional<Catalog.RoomClassInfo> roomClass = roomClassId == null ? Optional.empty()
                : catalog.roomClasses().stream().filter(c -> c.id() == roomClassId && c.active()).findFirst();
        errors.check(roomClass.isPresent(), "roomClassId", "Choose an active Room Class.");
        errors.throwIfAny();
        TermSummary term = terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        if (!term.stayStart().isAfter(today())) {
            throw ApiException.conflict("TERM_STARTED", "The stay of " + term.name()
                    + " has started, so its Room Classes are fixed.");
        }

        record Locked(long id, String code, long buildingId, long classId) {
        }
        List<Locked> rooms = jdbc.sql("""
                SELECT id, code, building_id, inv_room_class_in(id, :term) AS room_class_id FROM inv_room
                WHERE upper(code) IN (:codes) AND status <> 'RETIRED' ORDER BY id FOR UPDATE
                """)
                .param("term", term.id())
                .param("codes", List.copyOf(codes))
                .query((rs, i) -> new Locked(rs.getLong("id"), rs.getString("code"), rs.getLong("building_id"),
                        rs.getLong("room_class_id")))
                .list();
        Set<String> found = rooms.stream().map(r -> r.code().toUpperCase(Locale.ROOT)).collect(Collectors.toSet());
        codes.stream().filter(c -> !found.contains(c)).findFirst().ifPresent(c -> {
            throw ApiException.notFound("Room " + c + " does not exist.");
        });
        rooms.forEach(r -> blockScope.check(r.buildingId()));

        List<Locked> changing = rooms.stream().filter(r -> r.classId() != roomClassId).toList();
        if (!changing.isEmpty()) {
            Map<Long, Long> roomOfBed = new HashMap<>();
            jdbc.sql("SELECT id, room_id FROM inv_bed WHERE room_id IN (:rooms)")
                    .param("rooms", changing.stream().map(Locked::id).toList())
                    .query((rs, i) -> Map.entry(rs.getLong("id"), rs.getLong("room_id"))).list()
                    .forEach(e -> roomOfBed.put(e.getKey(), e.getValue()));
            Set<Long> promised = occupancy.bedsPromised(termsFrom(term), roomOfBed.keySet());
            if (!promised.isEmpty()) {
                long room = roomOfBed.get(promised.iterator().next());
                String code = changing.stream().filter(r -> r.id() == room).findFirst().map(Locked::code).orElse("");
                throw ApiException.conflict("ROOM_CLASS_LOCKED", "Beds of Room " + code + " are already given for "
                        + term.name() + " or later, so its Room Class can change only from a later Term.");
            }
        }
        Map<Long, String> classNames = classNames();
        Instant now = Instant.now(clock);
        for (Locked r : changing) {
            jdbc.sql("""
                    INSERT INTO inv_room_class_term (room_id, term_id, room_class_id, set_by, set_at)
                    VALUES (:room, :term, :class, :by, :now)
                    ON CONFLICT (room_id, term_id) DO UPDATE SET room_class_id = EXCLUDED.room_class_id,
                        set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at
                    """)
                    .param("room", r.id()).param("term", term.id()).param("class", roomClassId)
                    .param("by", currentUser.id()).param("now", Timestamp.from(now))
                    .update();
            Map<String, Object> change = new LinkedHashMap<>();
            change.put("term", term.name());
            change.put("roomClass", List.of(classNames.get(r.classId()), classNames.get(roomClassId)));
            audit.record("ROOM_CLASS_SET", AuditLog.Tone.INFO, "Room", r.id(), r.code(), change);
        }
        return new Changed(changing.size(), rooms.size() - changing.size());
    }

    // ---------------------------------------------------------------- helpers

    private List<Room> rooms(long termId, Long previousTerm, Set<Long> buildingIds, Integer floor, String q) {
        StringBuilder sql = new StringBuilder("""
                SELECT r.id, r.code, r.building_id, b.code AS block, f.floor_no, r.room_type_id,
                       inv_room_class_in(r.id, :term) AS class_id,
                       inv_room_class_in(r.id, CAST(:previous AS BIGINT)) AS previous_class_id,
                       EXISTS (SELECT 1 FROM inv_room_class_term s WHERE s.room_id = r.id AND s.term_id = :term) AS set_here
                FROM inv_room r JOIN inv_building b ON b.id = r.building_id JOIN inv_floor f ON f.id = r.floor_id
                WHERE r.building_id IN (:b) AND r.status <> 'RETIRED'
                """);
        Map<String, Object> params = new HashMap<>();
        params.put("term", termId);
        params.put("previous", previousTerm);
        params.put("b", List.copyOf(buildingIds));
        if (floor != null) {
            sql.append(" AND f.floor_no = :floor");
            params.put("floor", floor);
        }
        if (q != null && !q.isBlank()) {
            sql.append(" AND upper(r.code) LIKE :q");
            params.put("q", "%" + q.trim().toUpperCase(Locale.ROOT) + "%");
        }
        sql.append(" ORDER BY b.code, f.floor_no, r.code");
        return jdbc.sql(sql.toString()).params(params)
                .query((rs, i) -> new Room(rs.getLong("id"), rs.getString("code"), rs.getLong("building_id"),
                        rs.getString("block"), rs.getInt("floor_no"), rs.getLong("room_type_id"), rs.getLong("class_id"),
                        rs.getLong("previous_class_id"), rs.getBoolean("set_here")))
                .list();
    }

    /** Rooms of the page whose Beds are promised in the Term or later. */
    private Set<Long> lockedRooms(TermSummary term, List<TermSummary> published, List<Room> rooms) {
        if (rooms.isEmpty()) {
            return Set.of();
        }
        Map<Long, Long> roomOfBed = new HashMap<>();
        jdbc.sql("SELECT id, room_id FROM inv_bed WHERE room_id IN (:rooms)")
                .param("rooms", rooms.stream().map(Room::id).toList())
                .query((rs, i) -> Map.entry(rs.getLong("id"), rs.getLong("room_id"))).list()
                .forEach(e -> roomOfBed.put(e.getKey(), e.getValue()));
        List<Long> termIds = published.stream().filter(t -> !t.stayStart().isBefore(term.stayStart()))
                .map(TermSummary::id).toList();
        return occupancy.bedsPromised(termIds, roomOfBed.keySet()).stream().map(roomOfBed::get)
                .collect(Collectors.toSet());
    }

    /** The Term and the published Terms after it: a class set for the Term holds for them too. */
    private List<Long> termsFrom(TermSummary term) {
        List<Long> ids = new ArrayList<>();
        terms.publishedTerms().stream().filter(t -> !t.stayStart().isBefore(term.stayStart()))
                .forEach(t -> ids.add(t.id()));
        return ids;
    }

    private TermOption option(TermSummary t) {
        return new TermOption(String.valueOf(t.id()), t.name(), t.stayStart(), t.current(), t.stayStart().isAfter(today()));
    }

    private Map<Long, String> classNames() {
        return catalog.roomClasses().stream()
                .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name));
    }

    private LocalDate today() {
        return LocalDate.ofInstant(Instant.now(clock), TimeConfig.CAMPUS_ZONE);
    }
}
