package vn.fpt.campusstay.service.inventory;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.event.DoorCodeToSet;
import vn.fpt.campusstay.event.ResidentLeftRoom;
import vn.fpt.campusstay.service.auth.UserDirectory;

/**
 * Whenever a resident leaves a Room (spec §6.8 "rotation"), the Room needs a new door code: a task opens in
 * the same transaction as the check-out or the move, and the Block's Staff are told. Further departures before
 * the new code is confirmed join the open task.
 */
@Component
class DoorCodeRotation {

    private final JdbcClient jdbc;
    private final UserDirectory users;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    DoorCodeRotation(JdbcClient jdbc, UserDirectory users, ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.users = users;
        this.events = events;
        this.clock = clock;
    }

    @EventListener
    void on(ResidentLeftRoom e) {
        int opened = jdbc.sql("""
                INSERT INTO inv_door_code_task (room_id, reason, created_at) VALUES (:room, :reason, :now)
                ON CONFLICT (room_id) WHERE done_at IS NULL DO NOTHING
                """)
                .param("room", e.roomId()).param("reason", e.reason()).param("now", Timestamp.from(Instant.now(clock)))
                .update();
        if (opened == 0) {
            return;
        }
        record Room(String code, long buildingId) {
        }
        Room room = jdbc.sql("SELECT code, building_id FROM inv_room WHERE id = :id").param("id", e.roomId())
                .query((rs, i) -> new Room(rs.getString("code"), rs.getLong("building_id"))).single();
        List<Long> staff = users.staffOf(List.of(room.buildingId())).stream().map(UserDirectory.StaffMember::userId)
                .toList();
        if (!staff.isEmpty()) {
            events.publishEvent(new DoorCodeToSet(room.code(), staff));
        }
    }
}
