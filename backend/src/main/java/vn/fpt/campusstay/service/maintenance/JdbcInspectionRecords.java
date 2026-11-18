package vn.fpt.campusstay.service.maintenance;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.assignment.InspectionRecords;

/** ASG's {@link InspectionRecords}: the latest conditions and meters inspections recorded in a Room. */
@Component
@Transactional(readOnly = true)
class JdbcInspectionRecords implements InspectionRecords {

    private final JdbcClient jdbc;

    JdbcInspectionRecords(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Map<Long, Condition> latestConditions(long roomId) {
        Map<Long, Condition> result = new HashMap<>();
        jdbc.sql("""
                SELECT DISTINCT ON (c.check_key) c.check_key, c.condition, ir.inspected_at
                FROM mnt_inspection_room_check c JOIN mnt_inspection_room ir ON ir.id = c.inspection_room_id
                WHERE ir.room_id = :room AND ir.status = 'INSPECTED' AND c.condition IS NOT NULL
                  AND c.check_key LIKE 'FURNITURE:%'
                ORDER BY c.check_key, ir.inspected_at DESC
                """).param("room", roomId)
                .query((rs, i) -> Map.entry(Long.parseLong(rs.getString("check_key").substring("FURNITURE:".length())),
                        new Condition(rs.getString("condition"), rs.getTimestamp("inspected_at").toInstant())))
                .list().forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }


    @Override
    public Map<Long, String> worstSince(long roomId, java.time.Instant since) {
        Map<Long, String> result = new HashMap<>();
        jdbc.sql("""
                SELECT c.check_key, bool_or(c.condition = 'MISSING') AS missing
                FROM mnt_inspection_room_check c JOIN mnt_inspection_room ir ON ir.id = c.inspection_room_id
                WHERE ir.room_id = :room AND ir.status = 'INSPECTED' AND ir.inspected_at >= :since
                  AND c.condition IN ('DAMAGED', 'MISSING') AND c.check_key LIKE 'FURNITURE:%'
                GROUP BY c.check_key
                """).param("room", roomId).param("since", java.sql.Timestamp.from(since))
                .query((rs, i) -> Map.entry(Long.parseLong(rs.getString("check_key").substring("FURNITURE:".length())),
                        rs.getBoolean("missing") ? "MISSING" : "DAMAGED"))
                .list().forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }
    @Override
    public Optional<Meters> latestMeters(long roomId) {
        return jdbc.sql("""
                SELECT electricity, water, inspected_at FROM mnt_inspection_room
                WHERE room_id = :room AND status = 'INSPECTED' AND electricity IS NOT NULL AND water IS NOT NULL
                ORDER BY inspected_at DESC LIMIT 1
                """).param("room", roomId)
                .query((rs, i) -> new Meters(rs.getBigDecimal("electricity"), rs.getBigDecimal("water"),
                        rs.getTimestamp("inspected_at").toInstant()))
                .optional();
    }
}
