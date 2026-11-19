package vn.fpt.campusstay.service.maintenance;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.event.FurnitureFoundDamaged;
import vn.fpt.campusstay.event.FurnitureRepairLogged;
import vn.fpt.campusstay.event.MaintenanceReported;
import vn.fpt.campusstay.repository.maintenance.RequestStore;
import vn.fpt.campusstay.service.inventory.Inventory;

/**
 * A final check-in inventory (or check-out) found an item Damaged or Missing: a Missing item is replaced by a spare
 * from the Block store when there is one, otherwise (and for a Damaged item) a Furniture Maintenance Request names
 * the item, unless one is already open for it. Same transaction as the inventory.
 */
@Component
class FurnitureFoundListener {

    private record Room(long buildingId, String code) {
    }

    private final JdbcClient jdbc;
    private final Inventory inventory;
    private final RequestStore requests;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    FurnitureFoundListener(JdbcClient jdbc, Inventory inventory, RequestStore requests, ApplicationEventPublisher events,
            Clock clock) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.requests = requests;
        this.events = events;
        this.clock = clock;
    }

    @EventListener
    void on(FurnitureFoundDamaged e) {
        events.publishEvent(new vn.fpt.campusstay.event.FurnitureDamaged(e.furnitureItemId(), e.condition(),
                "Found " + e.condition().toLowerCase() + " in " + e.source(), e.reporterId()));
        boolean open = jdbc.sql("""
                SELECT EXISTS (SELECT 1 FROM mnt_request WHERE furniture_item_id = :item
                               AND status NOT IN ('RESOLVED', 'CLOSED'))
                """).param("item", e.furnitureItemId()).query(Boolean.class).single();
        if (open) {
            return;
        }
        Inventory.FurnitureLine line = inventory.furnitureLines(e.roomId()).stream()
                .filter(l -> l.id() == e.furnitureItemId()).findFirst().orElse(null);
        if (line == null) {
            return;
        }
        if (e.condition().equals("MISSING")) {
            Optional<String> spare = inventory.planRestock(e.roomId(), line.typeId(),
                    "Missing in " + e.source() + " (" + line.assetCode() + ")", e.reporterId());
            if (spare.isPresent()) {
                return;
            }
        }
        Room room = jdbc.sql("SELECT building_id, code FROM inv_room WHERE id = :id").param("id", e.roomId())
                .query((rs, i) -> new Room(rs.getLong("building_id"), rs.getString("code"))).single();
        Instant now = Instant.now(clock);
        String title = line.type() + " " + line.assetCode() + (e.condition().equals("MISSING") ? " is missing"
                : " needs a repair");
        String description = (e.note() == null || e.note().isBlank() ? "" : e.note().trim() + " · ")
                + "Found in " + e.source() + ".";
        record Created(long id, String code) {
        }
        Created row = jdbc.sql("""
                WITH next AS (SELECT nextval(pg_get_serial_sequence('mnt_request', 'id')) AS id)
                INSERT INTO mnt_request (id, code, room_id, building_id, room_code, reporter_id, source, title,
                                         description, category, location, urgency, priority, staff_may_enter,
                                         reported_at, furniture_item_id)
                OVERRIDING SYSTEM VALUE
                SELECT id, 'MR-' || lpad(id::text, greatest(6, length(id::text)), '0'), :room, :building, :roomCode,
                       :reporter, 'STAFF', :title, :description, 'FURNITURE', 'ROOM', 'NORMAL', 'MEDIUM', TRUE, :now,
                       :item
                FROM next
                RETURNING id, code
                """)
                .param("room", e.roomId()).param("building", room.buildingId()).param("roomCode", room.code())
                .param("reporter", e.reporterId()).param("title", title.length() > 150 ? title.substring(0, 150) : title)
                .param("description", description.length() > 2000 ? description.substring(0, 2000) : description)
                .param("now", Timestamp.from(now)).param("item", e.furnitureItemId())
                .query((rs, i) -> new Created(rs.getLong("id"), rs.getString("code"))).single();
        requests.event(row.id(), e.reporterId(), "STAFF", "Created from " + e.source(), null, false, now);
        events.publishEvent(new MaintenanceReported(row.id(), row.code(), room.buildingId(), "FURNITURE", "NORMAL"));
        events.publishEvent(new FurnitureRepairLogged(e.furnitureItemId(), row.code(), title, "Reported", e.reporterId()));
    }
}
