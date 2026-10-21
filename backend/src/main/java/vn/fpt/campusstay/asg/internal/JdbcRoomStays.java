package vn.fpt.campusstay.asg.internal;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.bil.RoomStays;
import vn.fpt.campusstay.inv.Inventory;

/**
 * Implements BIL's {@link RoomStays}. A stay starts at check-in, or at the move
 * when the student changed Room later (the moved Allocation keeps the original
 * check-in time), and ends with the Allocation.
 */
@Component
@Transactional(readOnly = true)
class JdbcRoomStays implements RoomStays {

    private final JdbcClient jdbc;
    private final Inventory inventory;

    JdbcRoomStays(JdbcClient jdbc, Inventory inventory) {
        this.jdbc = jdbc;
        this.inventory = inventory;
    }

    @Override
    public List<Stay> stays(Collection<Long> roomIds, Instant from, Instant to) {
        if (roomIds.isEmpty()) {
            return List.of();
        }
        Map<Long, Long> roomOfBed = roomIds.stream().flatMap(r -> inventory.bedsOfRoom(r).stream())
                .collect(Collectors.toMap(Inventory.BedSlot::bedId, Inventory.BedSlot::roomId, (a, b) -> a));
        if (roomOfBed.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                SELECT id, student_id, term_id, bed_id, greatest(checked_in_at, allocated_at) AS since, ended_at,
                       end_reason
                FROM asg_allocation
                WHERE bed_id IN (:beds) AND checked_in_at IS NOT NULL
                  AND greatest(checked_in_at, allocated_at) < :to AND (ended_at IS NULL OR ended_at > :from)
                ORDER BY since, id
                """)
                .param("beds", List.copyOf(roomOfBed.keySet())).param("from", Timestamp.from(from))
                .param("to", Timestamp.from(to))
                .query((rs, i) -> {
                    Timestamp ended = rs.getTimestamp("ended_at");
                    return new Stay(rs.getLong("id"), rs.getLong("student_id"), rs.getLong("term_id"),
                            roomOfBed.get(rs.getLong("bed_id")), rs.getTimestamp("since").toInstant(),
                            ended == null ? null : ended.toInstant(), "CHECK_OUT".equals(rs.getString("end_reason")));
                })
                .list();
    }
}
