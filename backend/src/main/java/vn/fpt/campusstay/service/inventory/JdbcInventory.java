package vn.fpt.campusstay.service.inventory;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.setting.TermCatalog;

@Component
@Transactional(readOnly = true)
class JdbcInventory implements Inventory {

    /** {@code :term} null = the class each Room was built with ({@code inv_room_class_in}, V38). */
    private static final String SLOT = """
            SELECT b.id AS bed_id, b.label, r.id AS room_id, r.code AS room_code, r.building_id, bu.code AS block,
                   trim(bu.gender) AS gender, f.floor_no, r.room_type_id,
                   inv_room_class_in(r.id, CAST(:term AS BIGINT)) AS room_class_id
            FROM inv_bed b JOIN inv_room r ON r.id = b.room_id JOIN inv_floor f ON f.id = r.floor_id
                 JOIN inv_building bu ON bu.id = r.building_id
            """;

    private final JdbcClient jdbc;
    private final TermCatalog terms;
    private final java.time.Clock clock;

    JdbcInventory(JdbcClient jdbc, TermCatalog terms, java.time.Clock clock) {
        this.clock = clock;
        this.jdbc = jdbc;
        this.terms = terms;
    }

    @Override
    public List<BedSlot> assignableBeds(long termId) {
        return assignable(termId);
    }

    @Override
    public Map<Long, BedSlot> beds(long termId, Collection<Long> bedIds) {
        return byId(termId, bedIds);
    }

    @Override
    public List<BedSlot> bedsOfRoom(long termId, long roomId) {
        return ofRoom(termId, roomId);
    }

    @Override
    public List<BedSlot> bedsOfBuilding(long termId, long buildingId) {
        return ofBuilding(termId, buildingId);
    }

    @Override
    public List<BedSlot> assignableBeds() {
        return assignable(currentTerm());
    }

    @Override
    public Map<Long, BedSlot> beds(Collection<Long> bedIds) {
        return byId(currentTerm(), bedIds);
    }

    @Override
    public List<BedSlot> bedsOfRoom(long roomId) {
        return ofRoom(currentTerm(), roomId);
    }

    @Override
    public List<BedSlot> bedsOfBuilding(long buildingId) {
        return ofBuilding(currentTerm(), buildingId);
    }

    /**
     * Also only the Blocks the Term uses, without the Rooms it leaves out (ADR-20, spec §6.4 step 3), and only the Room
     * Types and Classes it offers.
     */
    private List<BedSlot> assignable(Long termId) {
        List<BedSlot> beds = jdbc.sql(SLOT + """
                WHERE b.status = 'IN_SERVICE' AND r.status = 'IN_SERVICE' AND bu.status = 'ACTIVE'
                ORDER BY r.code, b.label
                """).param("term", termId).query(JdbcInventory::slot).list();
        if (termId == null) {
            return beds;
        }
        TermCatalog.TermRooms rooms = terms.rooms(termId);
        return rooms.all() ? beds : beds.stream()
                .filter(b -> rooms.uses(b.buildingId(), b.roomId(), b.roomTypeId(), b.roomClassId())).toList();
    }

    private Map<Long, BedSlot> byId(Long termId, Collection<Long> bedIds) {
        Map<Long, BedSlot> result = new LinkedHashMap<>();
        if (bedIds == null || bedIds.isEmpty()) {
            return result;
        }
        jdbc.sql(SLOT + " WHERE b.id IN (:ids) ORDER BY r.code, b.label").param("ids", List.copyOf(bedIds))
                .param("term", termId)
                .query(JdbcInventory::slot).list()
                .forEach(s -> result.put(s.bedId(), s));
        return result;
    }

    private List<BedSlot> ofRoom(Long termId, long roomId) {
        return jdbc.sql(SLOT + " WHERE r.id = :room AND b.status <> 'RETIRED' ORDER BY b.label").param("room", roomId)
                .param("term", termId).query(JdbcInventory::slot).list();
    }

    private List<BedSlot> ofBuilding(Long termId, long buildingId) {
        return jdbc.sql(SLOT + " WHERE r.building_id = :b AND b.status <> 'RETIRED' ORDER BY r.code, b.label")
                .param("b", buildingId).param("term", termId).query(JdbcInventory::slot).list();
    }

    @Override
    public Set<Long> doorCodeReady(Collection<Long> roomIds) {
        if (roomIds == null || roomIds.isEmpty()) {
            return Set.of();
        }
        return Set.copyOf(jdbc.sql("""
                SELECT c.room_id FROM inv_door_code c
                WHERE c.room_id IN (:rooms) AND c.status = 'ACTIVE'
                  AND NOT EXISTS (SELECT 1 FROM inv_door_code_task t WHERE t.room_id = c.room_id AND t.done_at IS NULL)
                """).param("rooms", List.copyOf(roomIds)).query(Long.class).list());
    }

    @Override
    public List<RoomFurniture> furnitureOf(long roomId) {
        return jdbc.sql("""
                SELECT i.id, i.asset_code, t.name, t.name_vi FROM inv_furniture_item i
                JOIN inv_furniture_type t ON t.id = i.furniture_type_id
                WHERE i.room_id = :room AND i.status <> 'DISPOSED' ORDER BY t.sort_order, i.asset_code
                """).param("room", roomId)
                .query((rs, i) -> new RoomFurniture(rs.getLong("id"), rs.getString("asset_code"), rs.getString("name"),
                        rs.getString("name_vi")))
                .list();
    }

    @Override
    public List<FurnitureLine> furnitureLines(long roomId) {
        return jdbc.sql("""
                SELECT i.id, i.asset_code, t.id AS type_id, t.name, t.name_vi, t.scope, i.bed_id, b.label AS bed_label,
                       i.status
                FROM inv_furniture_item i JOIN inv_furniture_type t ON t.id = i.furniture_type_id
                LEFT JOIN inv_bed b ON b.id = i.bed_id
                WHERE i.room_id = :room AND i.status <> 'DISPOSED'
                ORDER BY (t.scope = 'PERSONAL'), b.label NULLS FIRST, t.sort_order, i.asset_code
                """).param("room", roomId)
                .query((rs, i) -> new FurnitureLine(rs.getLong("id"), rs.getString("asset_code"), rs.getLong("type_id"),
                        rs.getString("name"), rs.getString("name_vi"), "PERSONAL".equals(rs.getString("scope")),
                        rs.getObject("bed_id", Long.class), rs.getString("bed_label"), rs.getString("status")))
                .list();
    }

    @Override
    public Map<Long, Long> furniturePrices(long roomId, long termId) {
        Map<Long, Long> prices = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT p.furniture_type_id, p.price FROM inv_furniture_price p
                WHERE p.room_class_id = inv_room_class_in(:room, :term)
                """).param("room", roomId).param("term", termId)
                .query((rs, i) -> Map.entry(rs.getLong("furniture_type_id"), rs.getLong("price"))).list()
                .forEach(e -> prices.put(e.getKey(), e.getValue()));
        return prices;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<String> planRestock(long roomId, long furnitureTypeId, String reason, long by) {
        record Spare(long id, String assetCode, long store) {
        }
        Optional<Spare> spare = jdbc.sql("""
                SELECT i.id, i.asset_code, i.store_building_id FROM inv_furniture_item i
                JOIN inv_room r ON r.building_id = i.store_building_id
                WHERE r.id = :room AND i.furniture_type_id = :type AND i.status = 'IN_STORE'
                  AND NOT EXISTS (SELECT 1 FROM inv_furniture_move m WHERE m.item_id = i.id AND m.status = 'PLANNED')
                ORDER BY i.asset_code LIMIT 1 FOR UPDATE OF i SKIP LOCKED
                """).param("room", roomId).param("type", furnitureTypeId)
                .query((rs, i) -> new Spare(rs.getLong("id"), rs.getString("asset_code"), rs.getLong("store_building_id")))
                .optional();
        spare.ifPresent(s -> jdbc.sql("""
                INSERT INTO inv_furniture_move (item_id, from_store_building_id, to_room_id, reason, status, created_by,
                                                created_at)
                VALUES (:item, :store, :room, :reason, 'PLANNED', :by, :now)
                """).param("item", s.id()).param("store", s.store()).param("room", roomId)
                .param("reason", reason.length() > 300 ? reason.substring(0, 300) : reason).param("by", by)
                .param("now", java.sql.Timestamp.from(clock.instant())).update());
        return spare.map(Spare::assetCode);
    }

    /** The current Term (stay includes today, else the next to start); null when nothing is published. */
    private Long currentTerm() {
        return terms.publishedTerms().stream().filter(TermSummary::current).map(TermSummary::id).findFirst()
                .orElse(null);
    }

    private static BedSlot slot(ResultSet rs, int i) throws SQLException {
        return new BedSlot(rs.getLong("bed_id"), rs.getString("label"), rs.getLong("room_id"), rs.getString("room_code"),
                rs.getLong("building_id"), rs.getString("block"), rs.getString("gender"), rs.getInt("floor_no"),
                rs.getLong("room_type_id"), rs.getLong("room_class_id"));
    }
}
