package vn.fpt.campusstay.service.assignment;

import java.sql.Timestamp;
import java.time.Instant;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.maintenance.CheckInInventories;

/** MNT's {@link CheckInInventories} from {@code asg_handover}. */
@Component
@Transactional(readOnly = true)
class JdbcCheckInInventories implements CheckInInventories {

    private final JdbcClient jdbc;

    JdbcCheckInInventories(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean startedSince(long roomId, Instant since) {
        return jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM asg_handover
                               WHERE room_id = :room AND opened_at >= :since AND status <> 'CANCELLED')
                """).param("room", roomId).param("since", Timestamp.from(since)).query(Boolean.class).single();
    }
}
