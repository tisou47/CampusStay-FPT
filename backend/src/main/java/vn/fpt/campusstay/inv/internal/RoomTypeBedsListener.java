package vn.fpt.campusstay.inv.internal;

import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.cfg.RoomTypeBedsChanged;

/**
 * Keeps the Beds of every Room of a Room Type equal to its number of Beds. Runs
 * in CFG's transaction (CFG has checked that no Bed of the type is allocated).
 * Extra Beds are retired, not deleted, because history refers to them.
 */
@Component
class RoomTypeBedsListener {

    private final JdbcClient jdbc;

    RoomTypeBedsListener(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @EventListener
    void on(RoomTypeBedsChanged event) {
        jdbc.sql("""
                INSERT INTO inv_bed (room_id, label)
                SELECT r.id, chr(64 + s.n)
                FROM inv_room r CROSS JOIN generate_series(1, :beds) AS s(n)
                WHERE r.room_type_id = :type AND r.status <> 'RETIRED'
                ON CONFLICT (room_id, label) DO UPDATE SET status = 'IN_SERVICE' WHERE inv_bed.status = 'RETIRED'
                """)
                .param("beds", event.beds()).param("type", event.roomTypeId()).update();
        jdbc.sql("""
                UPDATE inv_bed b SET status = 'RETIRED'
                FROM inv_room r
                WHERE r.id = b.room_id AND r.room_type_id = :type AND b.status <> 'RETIRED'
                  AND ascii(b.label) - 64 > :beds
                """)
                .param("beds", event.beds()).param("type", event.roomTypeId()).update();
    }
}
