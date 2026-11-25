package vn.fpt.campusstay.service.maintenance;

import java.time.Instant;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.repository.maintenance.RequestStore;

/**
 * Report 1 follows its repairs (user decision 25/11/2026): a furniture item an inspection found Worn, Damaged or
 * Missing is Good again in that Room's report once the Maintenance Request it opened is done (resolved in an empty
 * Room, confirmed by a resident in an occupied one, or closed). The report stops following once a student started a
 * check-in inventory on the Room after it: from then it is the fixed reference of that student's report 2.
 */
@Component
class ReportOneRepairs {

    private record Found(long inspectionRoomId, String checkKey, long roomId, Instant inspectedAt) {
    }

    private final JdbcClient jdbc;
    private final CheckInInventories inventories;

    ReportOneRepairs(JdbcClient jdbc, CheckInInventories inventories) {
        this.jdbc = jdbc;
        this.inventories = inventories;
    }

    /** The request is done: each furniture item of an inspection it came from is Good again. Caller's transaction. */
    void repaired(RequestStore.Request r) {
        List<Found> found = jdbc.sql("""
                SELECT c.inspection_room_id, c.check_key, ir.room_id, ir.inspected_at
                FROM mnt_inspection_room_check c JOIN mnt_inspection_room ir ON ir.id = c.inspection_room_id
                WHERE c.created_request_id = :req AND c.check_key LIKE 'FURNITURE:%'
                  AND c.condition IN ('WORN', 'DAMAGED', 'MISSING')
                """).param("req", r.id())
                .query((rs, i) -> new Found(rs.getLong(1), rs.getString(2), rs.getLong(3),
                        rs.getTimestamp(4) == null ? null : rs.getTimestamp(4).toInstant()))
                .list();
        for (Found f : found) {
            if (f.inspectedAt() != null && inventories.startedSince(f.roomId(), f.inspectedAt())) {
                continue;
            }
            String repaired = "Repaired: " + r.code();
            jdbc.sql("""
                    UPDATE mnt_inspection_room_check
                    SET condition = 'GOOD', result = 'PASS',
                        note = left(CASE WHEN note IS NULL OR note = '' THEN :repaired ELSE note || ' · ' || :repaired END, 500)
                    WHERE inspection_room_id = :ir AND check_key = :key
                    """).param("repaired", repaired).param("ir", f.inspectionRoomId()).param("key", f.checkKey())
                    .update();
        }
    }
}
