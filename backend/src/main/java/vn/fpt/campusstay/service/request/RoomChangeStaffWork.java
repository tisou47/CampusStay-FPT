package vn.fpt.campusstay.service.request;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.service.assignment.Moves;
import vn.fpt.campusstay.service.auth.StaffWork;
import vn.fpt.campusstay.service.auth.StaffWorkload;
import vn.fpt.campusstay.service.auth.UserDirectory;

/** Implements {@link StaffWork} for Room-Change Requests (Submitted or Pending) held by a person. */
@Component
class RoomChangeStaffWork implements StaffWork {

    private static final Map<String, String> STATUSES = Map.of("SUBMITTED", "Submitted", "PENDING", "Pending");

    private record Row(long id, String code, long studentId, long allocationId, long buildingId, String kind,
            String status, long assigneeId, Instant slaDueAt, Instant submittedAt) {
    }

    private final JdbcClient jdbc;
    private final UserDirectory users;
    private final Moves moves;
    private final RoomChangeAssignments assignments;
    private final Clock clock;

    RoomChangeStaffWork(JdbcClient jdbc, UserDirectory users, Moves moves, RoomChangeAssignments assignments,
            Clock clock) {
        this.jdbc = jdbc;
        this.users = users;
        this.moves = moves;
        this.assignments = assignments;
        this.clock = clock;
    }

    @Override
    public boolean handles(String type) {
        return StaffWorkload.ROOM_CHANGE.equals(type);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Item> openItems(long userId) {
        return items(jdbc.sql("""
                SELECT * FROM req_room_change WHERE assignee_id = :u AND status IN ('SUBMITTED', 'PENDING')
                """).param("u", userId).query((rs, i) -> row(rs)).list());
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Item lockOpen(String type, long id) {
        List<Item> found = items(jdbc.sql("""
                SELECT * FROM req_room_change WHERE id = :id AND status IN ('SUBMITTED', 'PENDING') FOR UPDATE
                """).param("id", id).query((rs, i) -> row(rs)).list());
        return found.isEmpty() ? null : found.getFirst();
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void reassign(String type, long id, long toUserId, String note) {
        if (!assignments.reassign(id, toUserId)) {
            throw ApiException.conflict("ITEM_CLOSED", "This work is no longer open.");
        }
    }

    private List<Item> items(List<Row> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Instant now = Instant.now(clock);
        Map<Long, String> names = users.displayNames(rows.stream().map(Row::studentId).toList());
        Map<Long, Moves.Placement> placed = moves.placements(rows.stream().map(Row::allocationId).toList());
        return rows.stream().map(r -> {
            Moves.Placement p = placed.get(r.allocationId());
            return new Item(StaffWorkload.ROOM_CHANGE, String.valueOf(r.id()), r.code(),
                    RoomChangeAssignments.title(names.get(r.studentId()), r.kind()), p == null ? null : p.room(),
                    STATUSES.get(r.status()), r.submittedAt(), r.slaDueAt(),
                    r.slaDueAt() != null && r.slaDueAt().isBefore(now), "/manager/room-changes", r.assigneeId(),
                    r.buildingId());
        }).toList();
    }

    private static Row row(java.sql.ResultSet rs) throws java.sql.SQLException {
        Timestamp due = rs.getTimestamp("sla_due_at");
        return new Row(rs.getLong("id"), rs.getString("code"), rs.getLong("student_id"), rs.getLong("allocation_id"),
                rs.getLong("building_id"), rs.getString("kind"), rs.getString("status"), rs.getLong("assignee_id"),
                due == null ? null : due.toInstant(), rs.getTimestamp("submitted_at").toInstant());
    }
}
