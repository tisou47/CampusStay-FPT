package vn.fpt.campusstay.service.maintenance;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.repository.maintenance.RequestStore;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.inventory.RoomRecords;

/** The Room hub's Maintenance Requests, newest first (implements Inventory's {@link RoomRecords}). */
@Component
@Transactional(readOnly = true)
class MaintenanceRoomRecords implements RoomRecords {

    private final JdbcClient jdbc;
    private final MaintenanceService labels;
    private final UserDirectory users;

    MaintenanceRoomRecords(JdbcClient jdbc, MaintenanceService labels, UserDirectory users) {
        this.jdbc = jdbc;
        this.labels = labels;
        this.users = users;
    }

    @Override
    public String section() {
        return "maintenance";
    }

    @Override
    public List<Item> of(long roomId, int limit) {
        List<RequestStore.Request> rows = jdbc.sql("""
                SELECT * FROM mnt_request WHERE room_id = :room ORDER BY reported_at DESC, id DESC LIMIT :limit
                """).param("room", roomId).param("limit", limit).query(RequestStore::request).list();
        Map<Long, String> names = users.displayNames(rows.stream().map(RequestStore.Request::assigneeId)
                .filter(Objects::nonNull).collect(Collectors.toSet()));
        return rows.stream().map(r -> new Item("maintenance", r.code(), r.title(),
                labels.label("MAINTENANCE_CATEGORY", r.category())
                        + (r.assigneeId() == null ? "" : " · " + names.get(r.assigneeId())),
                RequestStore.statusLabel(r.status()), r.reportedAt())).toList();
    }
}
