package vn.fpt.campusstay.service.maintenance;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.service.inventory.RoomRecords;

/** The Room hub's inspections, newest run first, with how many items failed (implements {@link RoomRecords}). */
@Component
@Transactional(readOnly = true)
class InspectionRoomRecords implements RoomRecords {

    private static final Map<String, String> STATUSES = Map.of("PENDING", "Pending", "INSPECTED", "Inspected",
            "UNREACHABLE", "Unreachable");

    private final JdbcClient jdbc;

    InspectionRoomRecords(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String section() {
        return "inspections";
    }

    @Override
    public List<Item> of(long roomId, int limit) {
        return jdbc.sql("""
                SELECT r.id, r.run_date, coalesce(s.name, 'Inspection') AS name, ir.status, ir.inspected_at,
                       (SELECT count(*) FROM mnt_inspection_result x
                        WHERE x.inspection_room_id = ir.id AND x.result = 'FAIL') AS failed
                FROM mnt_inspection_room ir JOIN mnt_inspection_run r ON r.id = ir.run_id
                LEFT JOIN mnt_inspection_schedule s ON s.id = r.schedule_id
                WHERE ir.room_id = :room ORDER BY r.run_date DESC, r.id DESC LIMIT :limit
                """).param("room", roomId).param("limit", limit)
                .query((rs, i) -> {
                    Timestamp inspected = rs.getTimestamp("inspected_at");
                    long failed = rs.getLong("failed");
                    return new Item("inspection", String.valueOf(rs.getLong("id")), rs.getString("name"),
                            failed == 0 ? "No item failed" : failed + (failed == 1 ? " item failed" : " items failed"),
                            STATUSES.get(rs.getString("status")),
                            inspected != null ? inspected.toInstant()
                                    : rs.getDate("run_date").toLocalDate().atStartOfDay(TimeConfig.CAMPUS_ZONE)
                                            .toInstant());
                })
                .list();
    }
}
