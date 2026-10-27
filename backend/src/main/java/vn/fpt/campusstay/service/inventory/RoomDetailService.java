package vn.fpt.campusstay.service.inventory;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * The Room panel of Rooms and Beds (spec §11.3 "Room"): its Room Class in the Term and in the next one, the
 * furniture conformance, the items in the Room and the state of its door code (for those who manage codes).
 */
@Service
public class RoomDetailService {

    public record NextTerm(String termId, String term, String roomClass) {
    }

    public record RoomDetails(String room, String block, int floor, String roomType, String term, String roomClass,
            NextTerm next, RoomClassService.Conformance conformance, List<FurnitureService.FurnitureItem> furniture,
            DoorCodeService.DoorCodeItem doorCode) {
    }

    /**
     * The Room hub (spec §11.3): the details above and what each feature holds about the Room ({@code residents},
     * {@code meterReadings}, {@code maintenance}, {@code inspections}).
     */
    public record RoomHub(RoomDetails details, Map<String, List<RoomRecords.Item>> sections) {
    }

    private static final int HUB_LIMIT = 20;

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final TermCatalog terms;
    private final Catalog catalog;
    private final RoomConformance conformance;
    private final FurnitureService furniture;
    private final DoorCodeService doorCodes;
    private final List<RoomRecords> records;

    public RoomDetailService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, TermCatalog terms,
            Catalog catalog, RoomConformance conformance, FurnitureService furniture, DoorCodeService doorCodes,
            List<RoomRecords> records) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.terms = terms;
        this.catalog = catalog;
        this.conformance = conformance;
        this.furniture = furniture;
        this.doorCodes = doorCodes;
        this.records = records;
    }

    /** @param termId null = the current Term (for the class and furniture conformance) */
    @Transactional(readOnly = true)
    public RoomHub hub(String code, Long termId) {
        RoomDetails details = details(code, termId);
        long roomId = jdbc.sql("SELECT id FROM inv_room WHERE code = :code").param("code", details.room())
                .query(Long.class).single();
        Map<String, List<RoomRecords.Item>> sections = new LinkedHashMap<>();
        for (String section : List.of("residents", "meterReadings", "maintenance", "inspections")) {
            sections.put(section, List.of());
        }
        for (RoomRecords source : records) {
            sections.put(source.section(), source.of(roomId, HUB_LIMIT));
        }
        return new RoomHub(details, sections);
    }

    /** @param termId null = the current Term */
    @Transactional(readOnly = true)
    public RoomDetails details(String code, Long termId) {
        currentUser.require(Permission.VIEW_INVENTORY);
        record Room(long id, String code, long buildingId, String block, int floor, long typeId) {
        }
        Room room = jdbc.sql("""
                SELECT r.id, r.code, r.building_id, b.code AS block, f.floor_no, r.room_type_id
                FROM inv_room r JOIN inv_building b ON b.id = r.building_id JOIN inv_floor f ON f.id = r.floor_id
                WHERE upper(r.code) = upper(:code) AND r.status <> 'RETIRED'
                """).param("code", code == null ? "" : code.trim())
                .query((rs, i) -> new Room(rs.getLong("id"), rs.getString("code"), rs.getLong("building_id"),
                        rs.getString("block"), rs.getInt("floor_no"), rs.getLong("room_type_id")))
                .optional().orElseThrow(() -> ApiException.notFound("Room " + code + " does not exist."));
        blockScope.check(room.buildingId());
        List<TermSummary> published = terms.publishedTerms();
        Optional<TermSummary> term = termId != null
                ? Optional.of(terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist.")))
                : published.stream().filter(TermSummary::current).findFirst();
        Map<Long, String> classNames = catalog.roomClasses().stream()
                .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name));
        long classId = classIn(room.id(), term.map(TermSummary::id).orElse(null));
        NextTerm next = term.flatMap(t -> published.stream().filter(n -> n.stayStart().isAfter(t.stayStart()))
                        .min(Comparator.comparing(TermSummary::stayStart)))
                .map(n -> new NextTerm(String.valueOf(n.id()), n.name(), classNames.get(classIn(room.id(), n.id()))))
                .orElse(null);
        String typeName = catalog.roomTypes().stream().filter(t -> t.id() == room.typeId())
                .map(Catalog.RoomTypeInfo::name).findFirst().orElse(null);
        DoorCodeService.DoorCodeItem doorCode = Permission.MANAGE_DOOR_CODES.allows(currentUser.get().role())
                ? doorCodes.summary(room.id()) : null;
        return new RoomDetails(room.code(), room.block(), room.floor(), typeName, term.map(TermSummary::name).orElse(null),
                classNames.get(classId), next, conformance.of(Map.of(room.id(), classId)).get(room.id()),
                furniture.ofRoom(room.id()), doorCode);
    }

    private long classIn(long roomId, Long termId) {
        return jdbc.sql("SELECT inv_room_class_in(:room, CAST(:term AS BIGINT))").param("room", roomId)
                .param("term", termId).query(Long.class).single();
    }
}
