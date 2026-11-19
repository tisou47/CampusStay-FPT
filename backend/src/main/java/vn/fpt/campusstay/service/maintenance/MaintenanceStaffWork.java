package vn.fpt.campusstay.service.maintenance;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.repository.maintenance.RequestStore;
import vn.fpt.campusstay.service.auth.StaffWork;
import vn.fpt.campusstay.service.auth.StaffWorkload;

/**
 * Implements {@link StaffWork} for Maintenance Requests (Submitted, Assigned or In progress) and inspection runs
 * (Scheduled or In progress) held by a person.
 */
@Component
class MaintenanceStaffWork implements StaffWork {

    private static final String OPEN_REQUEST = "status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')";
    private static final String OPEN_RUN = "r.status IN ('SCHEDULED', 'IN_PROGRESS')";
    private static final Map<String, String> RUN_STATUSES = Map.of("SCHEDULED", "Scheduled", "IN_PROGRESS",
            "In progress");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final JdbcClient jdbc;
    private final MaintenanceRequests requests;
    private final Clock clock;

    MaintenanceStaffWork(JdbcClient jdbc, MaintenanceRequests requests, Clock clock) {
        this.jdbc = jdbc;
        this.requests = requests;
        this.clock = clock;
    }

    @Override
    public boolean handles(String type) {
        return StaffWorkload.MAINTENANCE.equals(type) || StaffWorkload.INSPECTION.equals(type);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Item> openItems(long userId) {
        Instant now = Instant.now(clock);
        List<Item> items = new ArrayList<>(jdbc.sql("SELECT * FROM mnt_request WHERE assignee_id = :u AND " + OPEN_REQUEST)
                .param("u", userId).query((rs, i) -> request(rs, now)).list());
        items.addAll(jdbc.sql("""
                SELECT r.*, c.name AS checklist FROM mnt_inspection_run r JOIN mnt_checklist c ON c.id = r.checklist_id
                WHERE r.inspector_id = :u AND\s""" + OPEN_RUN).param("u", userId).query((rs, i) -> run(rs, now)).list());
        return items;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Item lockOpen(String type, long id) {
        Instant now = Instant.now(clock);
        if (StaffWorkload.MAINTENANCE.equals(type)) {
            return jdbc.sql("SELECT * FROM mnt_request WHERE id = :id AND " + OPEN_REQUEST + " FOR UPDATE")
                    .param("id", id).query((rs, i) -> request(rs, now)).optional().orElse(null);
        }
        return jdbc.sql("""
                SELECT r.*, c.name AS checklist FROM mnt_inspection_run r JOIN mnt_checklist c ON c.id = r.checklist_id
                WHERE r.id = :id AND\s""" + OPEN_RUN + " FOR UPDATE OF r")
                .param("id", id).query((rs, i) -> run(rs, now)).optional().orElse(null);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void reassign(String type, long id, long toUserId, String note) {
        if (StaffWorkload.MAINTENANCE.equals(type)) {
            // The history line holds 300 characters with the receiver's name; the full note is in the Audit Log.
            String why = note.length() <= 180 ? note : note.substring(0, 179) + "…";
            requests.assign(id, toUserId, "reassigned by a Manager: " + why);
            return;
        }
        int changed = jdbc.sql("UPDATE mnt_inspection_run SET inspector_id = :to WHERE id = :id AND status <> 'SUBMITTED'")
                .param("to", toUserId).param("id", id).update();
        if (changed == 0) {
            throw ApiException.conflict("ITEM_CLOSED", "This work is no longer open.");
        }
    }

    private static Item request(ResultSet rs, Instant now) throws SQLException {
        RequestStore.Request r = RequestStore.request(rs, 0);
        return new Item(StaffWorkload.MAINTENANCE, String.valueOf(r.id()), r.code(), r.title(), r.roomCode(),
                RequestStore.statusLabel(r.status()), r.reportedAt(), r.slaDueAt(),
                r.slaDueAt() != null && r.slaDueAt().isBefore(now), "/manager/maintenance/" + r.code(),
                r.assigneeId() == null ? 0 : r.assigneeId(), r.buildingId());
    }

    private static Item run(ResultSet rs, Instant now) throws SQLException {
        Instant due = rs.getTimestamp("due_at").toInstant();
        Timestamp created = rs.getTimestamp("created_at");
        return new Item(StaffWorkload.INSPECTION, String.valueOf(rs.getLong("id")),
                rs.getDate("run_date").toLocalDate().format(DAY), rs.getString("checklist"), null,
                RUN_STATUSES.get(rs.getString("status")), created.toInstant(), due, due.isBefore(now),
                "/manager/inspections", rs.getLong("inspector_id"), rs.getLong("building_id"));
    }
}
