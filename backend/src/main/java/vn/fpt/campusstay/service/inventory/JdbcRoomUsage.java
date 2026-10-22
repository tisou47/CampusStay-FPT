package vn.fpt.campusstay.service.inventory;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.setting.RoomUsage;
import vn.fpt.campusstay.service.inventory.BedOccupancy;

/** Implements Settings's {@link RoomUsage} port for the Room Type and Room Class screens. */
@Component
@Transactional(readOnly = true)
class JdbcRoomUsage implements RoomUsage {

    private final JdbcClient jdbc;
    private final BedOccupancy occupancy;

    JdbcRoomUsage(JdbcClient jdbc, BedOccupancy occupancy) {
        this.jdbc = jdbc;
        this.occupancy = occupancy;
    }

    @Override
    public Map<Long, Long> roomsByType() {
        Map<Long, Long> result = new HashMap<>();
        jdbc.sql("SELECT room_type_id, count(*) AS rooms FROM inv_room WHERE status <> 'RETIRED' GROUP BY room_type_id")
                .query((rs, i) -> Map.entry(rs.getLong("room_type_id"), rs.getLong("rooms")))
                .list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    @Override
    public Set<Long> roomTypesWithActiveAllocations() {
        Set<Long> beds = occupancy.bedsInUse();
        if (beds.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jdbc.sql("""
                SELECT DISTINCT r.room_type_id FROM inv_bed b JOIN inv_room r ON r.id = b.room_id WHERE b.id IN (:beds)
                """)
                .param("beds", List.copyOf(beds))
                .query(Long.class).list());
    }

    @Override
    public Map<Long, ClassUsage> usageByClass() {
        record Row(long classId, String block, int floor, long rooms) {
        }
        List<Row> rows = jdbc.sql("""
                SELECT f.room_class_id, b.code, f.floor_no, count(r.id) FILTER (WHERE r.status <> 'RETIRED') AS rooms
                FROM inv_floor f JOIN inv_building b ON b.id = f.building_id LEFT JOIN inv_room r ON r.floor_id = f.id
                GROUP BY f.room_class_id, b.code, f.floor_no
                ORDER BY b.code, f.floor_no
                """)
                .query((rs, i) -> new Row(rs.getLong("room_class_id"), rs.getString("code"), rs.getInt("floor_no"),
                        rs.getLong("rooms")))
                .list();
        Map<Long, Map<String, TreeSet<Integer>>> floors = new HashMap<>();
        Map<Long, Long> rooms = new HashMap<>();
        for (Row r : rows) {
            floors.computeIfAbsent(r.classId(), k -> new LinkedHashMap<>())
                    .computeIfAbsent(r.block(), k -> new TreeSet<>()).add(r.floor());
            rooms.merge(r.classId(), r.rooms(), Long::sum);
        }
        Map<Long, ClassUsage> result = new HashMap<>();
        floors.forEach((classId, byBlock) -> {
            List<String> parts = byBlock.entrySet().stream()
                    .map(e -> e.getKey() + " " + FloorRanges.format(e.getValue())).toList();
            result.put(classId, new ClassUsage(String.join(" · ", parts), rooms.getOrDefault(classId, 0L)));
        });
        return result;
    }
}
