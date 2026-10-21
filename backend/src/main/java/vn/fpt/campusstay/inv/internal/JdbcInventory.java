package vn.fpt.campusstay.inv.internal;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.inv.Inventory;

@Component
@Transactional(readOnly = true)
class JdbcInventory implements Inventory {

    private static final String SLOT = """
            SELECT b.id AS bed_id, b.label, r.id AS room_id, r.code AS room_code, r.building_id, bu.code AS block,
                   trim(bu.gender) AS gender, f.floor_no, r.room_type_id, f.room_class_id
            FROM inv_bed b JOIN inv_room r ON r.id = b.room_id JOIN inv_floor f ON f.id = r.floor_id
                 JOIN inv_building bu ON bu.id = r.building_id
            """;

    private final JdbcClient jdbc;

    JdbcInventory(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<BedSlot> assignableBeds() {
        return jdbc.sql(SLOT + """
                WHERE b.status = 'IN_SERVICE' AND r.status = 'IN_SERVICE' AND bu.status = 'ACTIVE'
                ORDER BY r.code, b.label
                """).query(JdbcInventory::slot).list();
    }

    @Override
    public Map<Long, BedSlot> beds(Collection<Long> bedIds) {
        Map<Long, BedSlot> result = new LinkedHashMap<>();
        if (bedIds == null || bedIds.isEmpty()) {
            return result;
        }
        jdbc.sql(SLOT + " WHERE b.id IN (:ids) ORDER BY r.code, b.label").param("ids", List.copyOf(bedIds))
                .query(JdbcInventory::slot).list()
                .forEach(s -> result.put(s.bedId(), s));
        return result;
    }

    @Override
    public List<BedSlot> bedsOfRoom(long roomId) {
        return jdbc.sql(SLOT + " WHERE r.id = :room AND b.status <> 'RETIRED' ORDER BY b.label").param("room", roomId)
                .query(JdbcInventory::slot).list();
    }

    @Override
    public List<BedSlot> bedsOfBuilding(long buildingId) {
        return jdbc.sql(SLOT + " WHERE r.building_id = :b AND b.status <> 'RETIRED' ORDER BY r.code, b.label")
                .param("b", buildingId).query(JdbcInventory::slot).list();
    }

    private static BedSlot slot(ResultSet rs, int i) throws SQLException {
        return new BedSlot(rs.getLong("bed_id"), rs.getString("label"), rs.getLong("room_id"), rs.getString("room_code"),
                rs.getLong("building_id"), rs.getString("block"), rs.getString("gender"), rs.getInt("floor_no"),
                rs.getLong("room_type_id"), rs.getLong("room_class_id"));
    }
}
