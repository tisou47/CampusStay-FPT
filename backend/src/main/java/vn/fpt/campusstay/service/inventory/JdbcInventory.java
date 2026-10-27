package vn.fpt.campusstay.service.inventory;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
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

    JdbcInventory(JdbcClient jdbc, TermCatalog terms) {
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

    /** Also only the Blocks the Term uses, without the Rooms it leaves out (ADR-20, spec §6.4 step 3). */
    private List<BedSlot> assignable(Long termId) {
        List<BedSlot> beds = jdbc.sql(SLOT + """
                WHERE b.status = 'IN_SERVICE' AND r.status = 'IN_SERVICE' AND bu.status = 'ACTIVE'
                ORDER BY r.code, b.label
                """).param("term", termId).query(JdbcInventory::slot).list();
        if (termId == null) {
            return beds;
        }
        TermCatalog.TermRooms rooms = terms.rooms(termId);
        return rooms.all() ? beds : beds.stream().filter(b -> rooms.uses(b.buildingId(), b.roomId())).toList();
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
