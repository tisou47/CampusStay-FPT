package vn.fpt.campusstay.service.inventory;

import java.sql.Timestamp;
import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.demo.DemoData;
import vn.fpt.campusstay.common.demo.DemoScripts;

/**
 * Inventory's demo part: Room Classes per Term, door codes and their tasks. Furniture, Rooms and Beds are base
 * data and stay. Every Room in service gets a random door code, confirmed on the lock by its Block's Staff a week
 * before Term N (only when {@code DOOR_CODE_KEY} is set; without it the door-code screens are off anyway).
 */
@Component
class InventoryDemoData implements DemoData {

    private record Room(long id, long staffId) {
    }

    private final JdbcTemplate jdbc;
    private final DoorCodeCipher cipher;

    InventoryDemoData(JdbcTemplate jdbc, DoorCodeCipher cipher) {
        this.jdbc = jdbc;
        this.cipher = cipher;
    }

    @Override
    public int order() {
        return 20;
    }

    @Override
    public void clear() {
        jdbc.execute("DELETE FROM inv_furniture_move WHERE status = 'PLANNED'");
        jdbc.execute("DELETE FROM inv_door_code_task");
        jdbc.execute("DELETE FROM inv_door_code");
        jdbc.execute("DELETE FROM inv_room_class_term");
        // Damage recorded while trying a stage (inspections, inventories, check-outs) goes with the business data:
        // the base data has no broken item.
        jdbc.execute("""
                UPDATE inv_furniture_item SET status = CASE WHEN room_id IS NULL THEN 'IN_STORE' ELSE 'IN_USE' END,
                       condition = 'GOOD', updated_at = now(), version = version + 1
                WHERE status IN ('BROKEN', 'IN_REPAIR') OR condition <> 'GOOD'
                """);
    }

    @Override
    public void load(Stage stage) {
        DemoScripts.run(jdbc, "inv.sql", stage);
        if (!cipher.enabled()) {
            return;
        }
        List<Room> rooms = jdbc.query("""
                SELECT r.id, s.id AS staff FROM inv_room r JOIN inv_building b ON b.id = r.building_id
                JOIN demo_staff s ON s.account = 'staff' || lower(b.code) || '01'
                WHERE r.status = 'IN_SERVICE' ORDER BY r.id
                """, (rs, i) -> new Room(rs.getLong("id"), rs.getLong("staff")));
        Timestamp at = jdbc.queryForObject("SELECT ((n_start - 7) + TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh' FROM demo_t",
                Timestamp.class);
        jdbc.batchUpdate("""
                INSERT INTO inv_door_code (room_id, code_cipher, status, source, proposed_by, proposed_at, confirmed_by,
                                           confirmed_at)
                VALUES (?, ?, 'ACTIVE', 'RANDOM', ?, ?, ?, ?)
                """, rooms, 500, (ps, room) -> {
            ps.setLong(1, room.id());
            ps.setString(2, cipher.encrypt(cipher.random()));
            ps.setLong(3, room.staffId());
            ps.setTimestamp(4, at);
            ps.setLong(5, room.staffId());
            ps.setTimestamp(6, at);
        });
        if ("D".equals(stage.code())) {
            rotateForCheckIn();
        }
    }

    /**
     * Check-in week (D): Staff set a new code on every Room a leaver left during the inspection, the day before
     * check-in opened, except the Room of D8 (its code is still to set, so its new residents wait) and A-803.
     */
    private void rotateForCheckIn() {
        jdbc.update("""
                INSERT INTO inv_door_code_task (room_id, reason, created_at)
                SELECT c.room_id, 'CHECK_OUT', ((t.n_end + 1) + TIME '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh'
                FROM demo_checkin c CROSS JOIN demo_t t
                WHERE c.named = 8
                  AND NOT EXISTS (SELECT 1 FROM inv_door_code_task k WHERE k.room_id = c.room_id AND k.done_at IS NULL)
                """);
        jdbc.update("""
                UPDATE inv_door_code d SET proposed_at = ((t.n_end + 2) + TIME '11:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
                       confirmed_at = ((t.n_end + 2) + TIME '11:30') AT TIME ZONE 'Asia/Ho_Chi_Minh'
                FROM demo_t t, inv_door_code_task k JOIN inv_room r ON r.id = k.room_id
                WHERE d.room_id = k.room_id AND d.status = 'ACTIVE' AND k.done_at IS NULL AND r.code <> 'A-803'
                  AND k.room_id <> coalesce((SELECT room_id FROM demo_checkin WHERE named = 8), -1)
                """);
        jdbc.update("""
                UPDATE inv_door_code_task k SET done_at = ((t.n_end + 2) + TIME '11:30') AT TIME ZONE 'Asia/Ho_Chi_Minh',
                       door_code_id = d.id
                FROM demo_t t, inv_door_code d JOIN inv_room r ON r.id = d.room_id
                WHERE d.room_id = k.room_id AND d.status = 'ACTIVE' AND k.done_at IS NULL AND r.code <> 'A-803'
                  AND k.room_id <> coalesce((SELECT room_id FROM demo_checkin WHERE named = 8), -1)
                """);
    }
}
