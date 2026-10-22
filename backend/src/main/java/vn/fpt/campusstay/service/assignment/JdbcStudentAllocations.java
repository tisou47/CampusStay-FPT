package vn.fpt.campusstay.service.assignment;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.application.StudentAllocations;
import vn.fpt.campusstay.service.inventory.Inventory;

/** Implements Applications's {@link StudentAllocations} port from the active Allocation of an Application. */
@Component
@Transactional(readOnly = true)
class JdbcStudentAllocations implements StudentAllocations {

    private record Row(long id, long bedId, Instant allocatedAt, Instant checkedInAt) {
    }

    private final JdbcClient jdbc;
    private final Inventory inventory;

    JdbcStudentAllocations(JdbcClient jdbc, Inventory inventory) {
        this.jdbc = jdbc;
        this.inventory = inventory;
    }

    @Override
    public Optional<Placement> ofApplication(long applicationId) {
        return jdbc.sql("""
                SELECT id, bed_id, allocated_at, checked_in_at FROM asg_allocation
                WHERE application_id = :app AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1
                """).param("app", applicationId)
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getLong("bed_id"), instant(rs.getTimestamp("allocated_at")),
                        instant(rs.getTimestamp("checked_in_at"))))
                .optional()
                .flatMap(row -> Optional.ofNullable(inventory.beds(List.of(row.bedId())).get(row.bedId()))
                        .map(bed -> new Placement(row.id(), bed.roomCode(), bed.bedLabel(), bed.block(), bed.floor(),
                                row.allocatedAt(), row.checkedInAt())));
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
