package vn.fpt.campusstay.service.inventory;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.service.setting.TermSupply;

/** Implements Settings's {@link TermSupply} port: Blocks, Rooms and the Beds of a Term per Room Type × Room Class. */
@Component
@Transactional(readOnly = true)
class JdbcTermSupply implements TermSupply {

    private final JdbcClient jdbc;
    private final RoomConformance conformance;

    JdbcTermSupply(JdbcClient jdbc, RoomConformance conformance) {
        this.jdbc = jdbc;
        this.conformance = conformance;
    }

    @Override
    public List<Block> blocks() {
        return jdbc.sql("""
                SELECT b.id, b.code, b.name, trim(b.gender) AS gender,
                       (SELECT count(*) FROM inv_room r WHERE r.building_id = b.id AND r.status <> 'RETIRED') AS rooms,
                       (SELECT count(*) FROM inv_bed d JOIN inv_room r ON r.id = d.room_id
                        WHERE r.building_id = b.id AND r.status <> 'RETIRED' AND d.status <> 'RETIRED') AS beds
                FROM inv_building b WHERE b.status = 'ACTIVE' ORDER BY b.code
                """)
                .query((rs, i) -> new Block(rs.getLong("id"), rs.getString("code"), rs.getString("name"),
                        rs.getString("gender"), rs.getInt("rooms"), rs.getInt("beds")))
                .list();
    }

    @Override
    public Map<String, Room> roomsByCode(Collection<String> codes) {
        Map<String, Room> result = new LinkedHashMap<>();
        List<String> upper = codes == null ? List.of()
                : codes.stream().filter(c -> c != null && !c.isBlank()).map(c -> c.trim().toUpperCase(Locale.ROOT))
                        .distinct().toList();
        if (upper.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT id, code, building_id FROM inv_room WHERE upper(code) IN (:codes) AND status <> 'RETIRED'")
                .param("codes", upper)
                .query((rs, i) -> new Room(rs.getLong("id"), rs.getString("code"), rs.getLong("building_id")))
                .list()
                .forEach(r -> result.put(r.code().toUpperCase(Locale.ROOT), r));
        return result;
    }

    @Override
    public Map<Long, String> roomCodes(Collection<Long> roomIds) {
        Map<Long, String> result = new HashMap<>();
        if (roomIds == null || roomIds.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT id, code FROM inv_room WHERE id IN (:ids)").param("ids", List.copyOf(roomIds))
                .query((rs, i) -> Map.entry(rs.getLong("id"), rs.getString("code"))).list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    @Override
    public List<Row> supply(long termId, TermCatalog.TermRooms rooms) {
        record RoomRow(long id, long buildingId, String block, String gender, long typeId, long classId, int beds) {
        }
        List<RoomRow> all = jdbc.sql("""
                SELECT r.id, r.building_id, bu.code, trim(bu.gender) AS gender, r.room_type_id,
                       inv_room_class_in(r.id, :term) AS class_id,
                       (SELECT count(*) FROM inv_bed b WHERE b.room_id = r.id AND b.status = 'IN_SERVICE') AS beds
                FROM inv_room r JOIN inv_building bu ON bu.id = r.building_id
                WHERE r.status = 'IN_SERVICE' AND bu.status = 'ACTIVE'
                ORDER BY bu.code, r.code
                """)
                .param("term", termId)
                .query((rs, i) -> new RoomRow(rs.getLong("id"), rs.getLong("building_id"), rs.getString("code"),
                        rs.getString("gender"), rs.getLong("room_type_id"), rs.getLong("class_id"), rs.getInt("beds")))
                .list().stream()
                .filter(r -> rooms.uses(r.buildingId(), r.id()))
                .toList();
        Map<Long, Long> classByRoom = new HashMap<>();
        all.forEach(r -> classByRoom.put(r.id(), r.classId()));
        Map<Long, RoomClassService.Conformance> matches = conformance.of(classByRoom);
        Map<String, Row> rows = new LinkedHashMap<>();
        for (RoomRow r : all) {
            String key = r.block() + ":" + r.typeId() + ":" + r.classId();
            Row row = rows.getOrDefault(key, new Row(r.buildingId(), r.block(), r.gender(), r.typeId(), r.classId(), 0, 0,
                    0));
            boolean off = matches.containsKey(r.id())
                    && RoomConformance.DOES_NOT_MATCH.equals(matches.get(r.id()).status());
            rows.put(key, new Row(row.buildingId(), row.block(), row.gender(), row.roomTypeId(), row.roomClassId(),
                    row.rooms() + 1, row.beds() + r.beds(), row.roomsNotMatching() + (off ? 1 : 0)));
        }
        return List.copyOf(rows.values());
    }

    @Override
    public Map<Long, List<Furniture>> classFurniture() {
        Map<Long, List<Furniture>> result = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT q.room_class_id, t.name, t.name_vi, q.quantity FROM inv_room_class_requirement q
                JOIN inv_furniture_type t ON t.id = q.furniture_type_id ORDER BY t.sort_order, t.name
                """)
                .query(rs -> {
                    result.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>())
                            .add(new Furniture(rs.getString(2), rs.getString(3), rs.getInt(4)));
                });
        return result;
    }
}
