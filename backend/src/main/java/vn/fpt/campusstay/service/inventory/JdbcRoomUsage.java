package vn.fpt.campusstay.service.inventory;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.setting.RoomUsage;
import vn.fpt.campusstay.service.setting.TermCatalog;

/** Implements Settings's {@link RoomUsage} port for the Room Type and Room Class screens. */
@Component
@Transactional(readOnly = true)
class JdbcRoomUsage implements RoomUsage {

    private final JdbcClient jdbc;
    private final BedOccupancy occupancy;
    private final TermCatalog terms;

    JdbcRoomUsage(JdbcClient jdbc, BedOccupancy occupancy, TermCatalog terms) {
        this.jdbc = jdbc;
        this.occupancy = occupancy;
        this.terms = terms;
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
        record Row(long classId, String block, long rooms) {
        }
        Long term = terms.publishedTerms().stream().filter(TermSummary::current).map(TermSummary::id).findFirst()
                .orElse(null);
        List<Row> rows = jdbc.sql("""
                SELECT c.class_id, c.code, count(*) AS rooms
                FROM (SELECT inv_room_class_in(r.id, CAST(:term AS BIGINT)) AS class_id, b.code
                      FROM inv_room r JOIN inv_building b ON b.id = r.building_id
                      WHERE r.status <> 'RETIRED') c
                GROUP BY c.class_id, c.code
                ORDER BY c.code
                """)
                .param("term", term)
                .query((rs, i) -> new Row(rs.getLong("class_id"), rs.getString("code"), rs.getLong("rooms")))
                .list();
        Map<Long, Map<String, Long>> byBlock = new HashMap<>();
        for (Row r : rows) {
            byBlock.computeIfAbsent(r.classId(), k -> new LinkedHashMap<>()).put(r.block(), r.rooms());
        }
        Map<Long, ClassUsage> result = new HashMap<>();
        byBlock.forEach((classId, blocks) -> {
            List<String> parts = blocks.entrySet().stream().map(e -> e.getKey() + " " + e.getValue()).toList();
            result.put(classId, new ClassUsage(String.join(" · ", parts),
                    blocks.values().stream().mapToLong(Long::longValue).sum()));
        });
        return result;
    }
}
