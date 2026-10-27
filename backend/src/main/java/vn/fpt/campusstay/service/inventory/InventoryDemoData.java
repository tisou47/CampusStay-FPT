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
        jdbc.execute("DELETE FROM inv_door_code_task");
        jdbc.execute("DELETE FROM inv_door_code");
        jdbc.execute("DELETE FROM inv_room_class_term");
    }

    @Override
    public void load(Stage stage) {
        DemoScripts.run(jdbc, "inv.sql", stage);
        if (!cipher.enabled()) {
            return;
        }
        List<Room> rooms = jdbc.query("""
                SELECT r.id, s.id AS staff FROM inv_room r JOIN inv_building b ON b.id = r.building_id
                JOIN demo_staff s ON s.account = 'staff.' || lower(b.code) || '1'
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
    }
}
