package vn.fpt.campusstay.service.inventory;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.BlockSelection;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * Furniture items (ADR-24, spec D-21, §6.19): every piece with its asset code, status and location (a Room or
 * the store of a Block), and its history. Staff and Managers change the status and move items inside their
 * Blocks, now or as a planned move (a task); Managers register new items and move them between Blocks.
 */
@Service
public class FurnitureService {

    /** {@code kind}: Room or Store; {@code room} null in a store. */
    public record Location(String kind, String room, String block) {
    }

    public record PlannedMove(String id, Location to, String reason) {
    }

    public record FurnitureItem(String id, String assetCode, String typeId, String type, String typeVi, String category,
            String status, Location location, String note, PlannedMove plannedMove, Instant updatedAt) {
    }

    public record TypeOption(String id, String name, String nameVi) {
    }

    public record Options(List<TypeOption> types, List<String> statuses, List<String> blocks) {
    }

    public record FurniturePage(List<FurnitureItem> items, long total, Map<String, Long> counts, Options options) {
    }

    /** {@code kind}: Registered, Status changed or Moved; {@code from} / {@code to} are statuses or locations. */
    public record HistoryEntry(Instant at, String kind, String from, String to, String reason, String by) {
    }

    public record FurnitureDetail(FurnitureItem item, List<HistoryEntry> history) {
    }

    public record Registered(List<String> assetCodes) {
    }

    public record MoveRow(String id, String itemId, String assetCode, String type, String typeVi, Location from,
            Location to, String reason, String status, String createdBy, Instant createdAt, String closedBy,
            Instant closedAt) {
    }

    public record MovePage(List<MoveRow> items, long total, List<String> statuses) {
    }

    public record Moved(int moved, int planned) {
    }

    /** A student's view of an item of their Room. */
    public record RoomItem(String assetCode, String type, String typeVi, String status) {
    }

    public record MyFurniture(String room, List<RoomItem> items) {
    }

    static final Map<String, String> STATUSES = statuses();
    private static final Map<String, String> MOVE_STATUSES = Map.of("PLANNED", "Planned", "DONE", "Done",
            "CANCELLED", "Cancelled");
    private static final Map<String, String> EVENT_KINDS = Map.of("REGISTERED", "Registered", "STATUS", "Status changed",
            "MOVED", "Moved");
    private static final int MAX_REGISTER = 100;
    private static final int MAX_MOVE = 200;

    private static final String ITEM = """
            SELECT i.id, i.asset_code, i.furniture_type_id, t.name, t.name_vi, t.category, i.status, i.note, i.updated_at,
                   i.room_id, r.code AS room, COALESCE(r.building_id, i.store_building_id) AS building_id,
                   COALESCE(rb.code, sb.code) AS block,
                   m.id AS move_id, m.reason AS move_reason, mr.code AS move_room, COALESCE(mrb.code, msb.code) AS move_block,
                   count(*) OVER () AS total
            FROM inv_furniture_item i JOIN inv_furniture_type t ON t.id = i.furniture_type_id
            LEFT JOIN inv_room r ON r.id = i.room_id LEFT JOIN inv_building rb ON rb.id = r.building_id
            LEFT JOIN inv_floor rf ON rf.id = r.floor_id
            LEFT JOIN inv_building sb ON sb.id = i.store_building_id
            LEFT JOIN inv_furniture_move m ON m.item_id = i.id AND m.status = 'PLANNED'
            LEFT JOIN inv_room mr ON mr.id = m.to_room_id LEFT JOIN inv_building mrb ON mrb.id = mr.building_id
            LEFT JOIN inv_building msb ON msb.id = m.to_store_building_id
            """;

    /** Where an item is: in a Room or in the store of a Block. */
    private record Place(Long roomId, long buildingId, String room, String block) {

        String label() {
            return room != null ? "Room " + room : "Block " + block + " store";
        }

        Location location() {
            return new Location(room != null ? "Room" : "Store", room, block);
        }
    }

    private record Item(long id, String assetCode, String typeName, String status, Place place) {
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blocks;
    private final UserDirectory users;
    private final BedOccupancy occupancy;
    private final TermCatalog terms;
    private final AuditLog audit;
    private final Clock clock;

    public FurnitureService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, BlockDirectory blocks,
            UserDirectory users, BedOccupancy occupancy, TermCatalog terms, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blocks = blocks;
        this.users = users;
        this.occupancy = occupancy;
        this.terms = terms;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- items

    /**
     * @param location {@code room} (in Rooms) or {@code store} (in the Block stores); blank = both
     * @param status   a status label; disposed items are listed only when asked for
     */
    @Transactional(readOnly = true)
    public FurniturePage list(String block, String room, String location, Long typeId, String status, String q,
            PageQuery page) {
        currentUser.require(Permission.VIEW_INVENTORY);
        BlockSelection scope = blockScope.resolve(block);
        StringBuilder where = new StringBuilder(" WHERE COALESCE(r.building_id, i.store_building_id) IN (:b)");
        Map<String, Object> params = new HashMap<>();
        params.put("b", List.copyOf(scope.ids()));
        if (room != null && !room.isBlank()) {
            where.append(" AND upper(r.code) = :room");
            params.put("room", room.trim().toUpperCase(Locale.ROOT));
        }
        if ("room".equalsIgnoreCase(location)) {
            where.append(" AND i.room_id IS NOT NULL");
        } else if ("store".equalsIgnoreCase(location)) {
            where.append(" AND i.store_building_id IS NOT NULL");
        }
        if (typeId != null) {
            where.append(" AND i.furniture_type_id = :type");
            params.put("type", typeId);
        }
        if (q != null && !q.isBlank()) {
            where.append(" AND (upper(i.asset_code) LIKE :q OR upper(r.code) LIKE :q OR upper(t.name) LIKE :q"
                    + " OR upper(t.name_vi) LIKE :q)");
            params.put("q", "%" + q.trim().toUpperCase(Locale.ROOT) + "%");
        }
        Map<String, Long> counts = new LinkedHashMap<>();
        STATUSES.values().forEach(s -> counts.put(s, 0L));
        jdbc.sql("""
                SELECT i.status, count(*) AS n FROM inv_furniture_item i JOIN inv_furniture_type t ON t.id = i.furniture_type_id
                LEFT JOIN inv_room r ON r.id = i.room_id""" + where + " GROUP BY i.status")
                .params(params)
                .query((rs, i) -> Map.entry(rs.getString("status"), rs.getLong("n"))).list()
                .forEach(e -> counts.put(STATUSES.get(e.getKey()), e.getValue()));
        String code = status == null || status.isBlank() ? null : statusCode(status);
        if (code != null) {
            where.append(" AND i.status = :status");
            params.put("status", code);
        } else {
            where.append(" AND i.status <> 'DISPOSED'");
        }
        params.put("limit", page.limit());
        params.put("offset", page.offset());
        List<Object[]> rows = jdbc.sql(ITEM + where + """
                 ORDER BY COALESCE(rb.code, sb.code), (r.code IS NULL), rf.floor_no, r.code, t.sort_order, i.asset_code
                LIMIT :limit OFFSET :offset
                """)
                .params(params)
                .query((rs, i) -> new Object[] { item(rs), rs.getLong("total") }).list();
        List<FurnitureItem> items = rows.stream().map(r -> (FurnitureItem) r[0]).toList();
        long total = rows.isEmpty() ? 0 : (long) rows.getFirst()[1];
        List<TypeOption> types = jdbc.sql("""
                SELECT id, name, name_vi FROM inv_furniture_type WHERE status = 'ACTIVE' ORDER BY sort_order, name
                """).query((rs, i) -> new TypeOption(String.valueOf(rs.getLong("id")), rs.getString("name"),
                rs.getString("name_vi"))).list();
        List<String> blockCodes = blocks.codesByIds(scope.ids()).values().stream().sorted().toList();
        return new FurniturePage(items, total, counts, new Options(types, List.copyOf(STATUSES.values()), blockCodes));
    }

    @Transactional(readOnly = true)
    public FurnitureDetail detail(long id) {
        currentUser.require(Permission.VIEW_INVENTORY);
        FurnitureItem item = jdbc.sql(ITEM + " WHERE i.id = :id").param("id", id).query((rs, i) -> item(rs)).optional()
                .orElseThrow(() -> ApiException.notFound("This furniture item does not exist."));
        long building = buildingOf(id);
        blockScope.check(building);
        record Event(Instant at, String kind, String from, String to, String reason, long by) {
        }
        List<Event> events = jdbc.sql("""
                SELECT at, kind, from_value, to_value, reason, by_user FROM inv_furniture_event WHERE item_id = :id
                ORDER BY at DESC, id DESC
                """).param("id", id)
                .query((rs, i) -> new Event(rs.getTimestamp("at").toInstant(), rs.getString("kind"),
                        rs.getString("from_value"), rs.getString("to_value"), rs.getString("reason"), rs.getLong("by_user")))
                .list();
        Map<Long, String> names = users.displayNames(events.stream().map(Event::by).collect(Collectors.toSet()));
        List<HistoryEntry> history = events.stream()
                .map(e -> new HistoryEntry(e.at(), EVENT_KINDS.get(e.kind()), e.from(), e.to(), e.reason(), names.get(e.by())))
                .toList();
        return new FurnitureDetail(item, history);
    }

    /** Registers new items of a type in a Room or in the store of a Block (Managers: the catalogue). */
    @Transactional
    public Registered register(Long typeId, String block, String room, Integer quantity, String note) {
        currentUser.require(Permission.MANAGE_FURNITURE_CATALOGUE);
        FieldErrors errors = new FieldErrors();
        record Type(long id, String code, String name) {
        }
        Optional<Type> type = typeId == null ? Optional.empty() : jdbc.sql("""
                SELECT id, code, name FROM inv_furniture_type WHERE id = :id AND status = 'ACTIVE'
                """).param("id", typeId).query((rs, i) -> new Type(rs.getLong("id"), rs.getString("code"),
                rs.getString("name"))).optional();
        errors.check(type.isPresent(), "typeId", "Choose an active furniture type.");
        errors.check(quantity != null && quantity >= 1 && quantity <= MAX_REGISTER, "quantity",
                "Enter a quantity from 1 to " + MAX_REGISTER + ".");
        String trimmedNote = note == null || note.isBlank() ? null : note.trim();
        errors.check(trimmedNote == null || trimmedNote.length() <= 500, "note", "Keep the note under 500 characters.");
        errors.check(block != null && !block.isBlank(), "block", "Choose a Block.");
        errors.throwIfAny();
        Place place = target(room, block);
        blockScope.check(place.buildingId());
        Timestamp now = Timestamp.from(Instant.now(clock));
        List<String> codes = new ArrayList<>();
        for (int k = 0; k < quantity; k++) {
            Optional<Long> id = Optional.empty();
            String assetCode = null;
            while (id.isEmpty()) {
                long seq = jdbc.sql("SELECT nextval('inv_asset_seq')").query(Long.class).single();
                assetCode = type.get().code() + "-" + String.format("%06d", seq);
                id = jdbc.sql("""
                        INSERT INTO inv_furniture_item (asset_code, furniture_type_id, status, room_id, store_building_id,
                                                        note, created_at, updated_at)
                        VALUES (:code, :type, :status, :room, :store, :note, :now, :now)
                        ON CONFLICT (asset_code) DO NOTHING RETURNING id
                        """)
                        .param("code", assetCode).param("type", type.get().id())
                        .param("status", place.roomId() != null ? "IN_USE" : "IN_STORE")
                        .param("room", place.roomId()).param("store", place.roomId() == null ? place.buildingId() : null)
                        .param("note", trimmedNote).param("now", now)
                        .query(Long.class).optional();
            }
            event(id.get(), "REGISTERED", null, place.label(), trimmedNote);
            codes.add(assetCode);
        }
        audit.record("FURNITURE_REGISTERED", AuditLog.Tone.INFO, "Furniture type", type.get().id(), type.get().name(),
                Map.of("items", codes.size(), "location", place.label()));
        return new Registered(codes);
    }

    /** Changes an item's status or note; In store needs a store, In use a Room; Disposed is final. */
    @Transactional
    public FurnitureItem update(long id, String status, String note, String reason) {
        currentUser.require(Permission.MANAGE_FURNITURE);
        Item item = lock(List.of(id)).getFirst();
        blockScope.check(item.place().buildingId());
        if ("DISPOSED".equals(item.status())) {
            throw ApiException.conflict("ITEM_DISPOSED", "Item " + item.assetCode() + " is disposed and cannot change.");
        }
        FieldErrors errors = new FieldErrors();
        String code = status == null || status.isBlank() ? item.status() : statusCode(status);
        errors.check(code != null, "status", "Choose a status from the list.");
        if (code != null) {
            errors.check(!"IN_STORE".equals(code) || item.place().roomId() == null, "status",
                    "Move the item to a store to mark it In store.");
            errors.check(!"IN_USE".equals(code) || item.place().roomId() != null, "status",
                    "Move the item to a Room to mark it In use.");
        }
        String trimmedReason = reason == null || reason.isBlank() ? null : reason.trim();
        errors.check(trimmedReason == null || trimmedReason.length() <= 500, "reason", "Keep the reason under 500 characters.");
        errors.check(note == null || note.trim().length() <= 500, "note", "Keep the note under 500 characters.");
        errors.throwIfAny();
        Timestamp now = Timestamp.from(Instant.now(clock));
        jdbc.sql("UPDATE inv_furniture_item SET status = :status, updated_at = :now, version = version + 1 WHERE id = :id")
                .param("status", code).param("now", now).param("id", id)
                .update();
        if (note != null) {
            // An empty note clears it.
            jdbc.sql("UPDATE inv_furniture_item SET note = :note WHERE id = :id")
                    .param("note", note.isBlank() ? null : note.trim()).param("id", id).update();
        }
        if (!code.equals(item.status())) {
            event(id, "STATUS", STATUSES.get(item.status()), STATUSES.get(code), trimmedReason);
            if ("DISPOSED".equals(code)) {
                jdbc.sql("""
                        UPDATE inv_furniture_move SET status = 'CANCELLED', closed_by = :by, closed_at = :now
                        WHERE item_id = :id AND status = 'PLANNED'
                        """).param("by", currentUser.id()).param("now", now).param("id", id).update();
            }
            Map<String, Object> change = new LinkedHashMap<>();
            change.put("status", List.of(STATUSES.get(item.status()), STATUSES.get(code)));
            if (trimmedReason != null) {
                change.put("reason", trimmedReason);
            }
            audit.record("FURNITURE_STATUS_CHANGED", "DISPOSED".equals(code) ? AuditLog.Tone.WARNING : AuditLog.Tone.INFO,
                    "Furniture item", id, item.assetCode(), change);
        }
        return jdbc.sql(ITEM + " WHERE i.id = :id").param("id", id).query((rs, i) -> item(rs)).single();
    }

    // ---------------------------------------------------------------- moves

    /**
     * Moves items to a Room or to the store of a Block, now or as a planned move. Inside the user's Blocks:
     * Staff and Managers; to another Block: Managers only.
     *
     * @param toRoom  a Room code, or null with {@code toStore}
     * @param toStore a Block code: its store
     */
    @Transactional
    public Moved move(List<Long> itemIds, String toRoom, String toStore, String reason, Boolean planned) {
        currentUser.require(Permission.MANAGE_FURNITURE);
        FieldErrors errors = new FieldErrors();
        Set<Long> ids = itemIds == null ? Set.of() : itemIds.stream().filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        errors.check(!ids.isEmpty(), "items", "Choose at least one item.");
        errors.check(ids.size() <= MAX_MOVE, "items", "Move at most " + MAX_MOVE + " items at a time.");
        boolean hasRoom = toRoom != null && !toRoom.isBlank();
        boolean hasStore = toStore != null && !toStore.isBlank();
        errors.check(hasRoom != hasStore, "to", "Choose a Room or a Block store.");
        String why = reason == null ? "" : reason.trim();
        errors.check(!why.isEmpty(), "reason", "Write why the items move.");
        errors.check(why.length() <= 300, "reason", "Keep the reason under 300 characters.");
        errors.throwIfAny();
        Place to = target(hasRoom ? toRoom : null, hasStore ? toStore : null);
        blockScope.check(to.buildingId());
        List<Item> items = lock(List.copyOf(ids));
        boolean manager = Permission.MANAGE_FURNITURE_CATALOGUE.allows(currentUser.get().role());
        Set<Long> withPlannedMove = Set.copyOf(jdbc.sql("""
                SELECT item_id FROM inv_furniture_move WHERE item_id IN (:ids) AND status = 'PLANNED'
                """).param("ids", List.copyOf(ids)).query(Long.class).list());
        for (Item item : items) {
            blockScope.check(item.place().buildingId());
            if ("DISPOSED".equals(item.status())) {
                throw ApiException.conflict("ITEM_DISPOSED", "Item " + item.assetCode() + " is disposed and cannot change.");
            }
            if (item.place().buildingId() != to.buildingId() && !manager) {
                throw ApiException.forbidden("CROSS_BLOCK", "Only a Manager moves furniture to another Block.");
            }
            if (Objects.equals(item.place().roomId(), to.roomId())
                    && (to.roomId() != null || item.place().buildingId() == to.buildingId())) {
                throw ApiException.conflict("SAME_LOCATION", "Item " + item.assetCode() + " is already in "
                        + to.label() + ".");
            }
            if (withPlannedMove.contains(item.id())) {
                throw ApiException.conflict("MOVE_PLANNED", "Item " + item.assetCode()
                        + " already has a planned move. Finish or cancel it first.");
            }
        }
        boolean plan = Boolean.TRUE.equals(planned);
        Timestamp now = Timestamp.from(Instant.now(clock));
        for (Item item : items) {
            jdbc.sql("""
                    INSERT INTO inv_furniture_move (item_id, from_room_id, from_store_building_id, to_room_id,
                                                    to_store_building_id, reason, status, created_by, created_at,
                                                    closed_by, closed_at)
                    VALUES (:item, :fromRoom, :fromStore, :toRoom, :toStore, :reason, :status, :by, :now, :closedBy, :closedAt)
                    """)
                    .param("item", item.id()).param("fromRoom", item.place().roomId())
                    .param("fromStore", item.place().roomId() == null ? item.place().buildingId() : null)
                    .param("toRoom", to.roomId()).param("toStore", to.roomId() == null ? to.buildingId() : null)
                    .param("reason", why).param("status", plan ? "PLANNED" : "DONE").param("by", currentUser.id())
                    .param("now", now).param("closedBy", plan ? null : currentUser.id()).param("closedAt", plan ? null : now)
                    .update();
            if (!plan) {
                apply(item, to, why, now);
            }
            Map<String, Object> change = new LinkedHashMap<>();
            change.put("from", item.place().label());
            change.put("to", to.label());
            change.put("reason", why);
            audit.record(plan ? "FURNITURE_MOVE_PLANNED" : "FURNITURE_MOVED", AuditLog.Tone.INFO, "Furniture item",
                    item.id(), item.assetCode(), change);
        }
        return new Moved(plan ? 0 : items.size(), plan ? items.size() : 0);
    }

    /** @param status Planned (default), Done or Cancelled */
    @Transactional(readOnly = true)
    public MovePage moves(String block, String status, PageQuery page) {
        currentUser.require(Permission.VIEW_INVENTORY);
        BlockSelection scope = blockScope.resolve(block);
        String code = MOVE_STATUSES.entrySet().stream()
                .filter(e -> status != null && e.getValue().equalsIgnoreCase(status.trim())).map(Map.Entry::getKey)
                .findFirst().orElse("PLANNED");
        record Row(MoveRow row, long createdBy, Long closedBy, long total) {
        }
        List<Row> rows = jdbc.sql("""
                SELECT m.id, m.item_id, i.asset_code, t.name, t.name_vi, m.reason, m.status, m.created_by, m.created_at,
                       m.closed_by, m.closed_at,
                       fr.code AS from_room, COALESCE(frb.code, fsb.code) AS from_block,
                       tr.code AS to_room, COALESCE(trb.code, tsb.code) AS to_block,
                       count(*) OVER () AS total
                FROM inv_furniture_move m JOIN inv_furniture_item i ON i.id = m.item_id
                JOIN inv_furniture_type t ON t.id = i.furniture_type_id
                LEFT JOIN inv_room fr ON fr.id = m.from_room_id LEFT JOIN inv_building frb ON frb.id = fr.building_id
                LEFT JOIN inv_building fsb ON fsb.id = m.from_store_building_id
                LEFT JOIN inv_room tr ON tr.id = m.to_room_id LEFT JOIN inv_building trb ON trb.id = tr.building_id
                LEFT JOIN inv_building tsb ON tsb.id = m.to_store_building_id
                WHERE m.status = :status AND (COALESCE(fr.building_id, m.from_store_building_id) IN (:b)
                                              OR COALESCE(tr.building_id, m.to_store_building_id) IN (:b))
                ORDER BY m.created_at DESC, m.id DESC
                LIMIT :limit OFFSET :offset
                """)
                .param("status", code).param("b", List.copyOf(scope.ids()))
                .param("limit", page.limit()).param("offset", page.offset())
                .query((rs, i) -> new Row(new MoveRow(String.valueOf(rs.getLong("id")), String.valueOf(rs.getLong("item_id")),
                        rs.getString("asset_code"), rs.getString("name"), rs.getString("name_vi"),
                        location(rs.getString("from_room"), rs.getString("from_block")),
                        location(rs.getString("to_room"), rs.getString("to_block")), rs.getString("reason"),
                        MOVE_STATUSES.get(rs.getString("status")), null, rs.getTimestamp("created_at").toInstant(), null,
                        instant(rs, "closed_at")), rs.getLong("created_by"), rs.getObject("closed_by", Long.class),
                        rs.getLong("total")))
                .list();
        Set<Long> people = new HashSet<>();
        rows.forEach(r -> {
            people.add(r.createdBy());
            if (r.closedBy() != null) {
                people.add(r.closedBy());
            }
        });
        Map<Long, String> names = users.displayNames(people);
        List<MoveRow> items = rows.stream().map(r -> new MoveRow(r.row().id(), r.row().itemId(), r.row().assetCode(),
                r.row().type(), r.row().typeVi(), r.row().from(), r.row().to(), r.row().reason(), r.row().status(),
                names.get(r.createdBy()), r.row().createdAt(), r.closedBy() == null ? null : names.get(r.closedBy()),
                r.row().closedAt())).toList();
        return new MovePage(items, rows.isEmpty() ? 0 : rows.getFirst().total(), List.copyOf(MOVE_STATUSES.values()));
    }

    /** The planned move happened: the item is now at its new place. Staff of either Block may record it. */
    @Transactional
    public void finishMove(long moveId) {
        closeMove(moveId, true);
    }

    @Transactional
    public void cancelMove(long moveId) {
        closeMove(moveId, false);
    }

    // ---------------------------------------------------------------- Rooms and the student

    /** Items in the Room (not disposed), for the Room hub. */
    @Transactional(readOnly = true)
    public List<FurnitureItem> ofRoom(long roomId) {
        return jdbc.sql(ITEM + " WHERE i.room_id = :room AND i.status <> 'DISPOSED' ORDER BY t.sort_order, i.asset_code")
                .param("room", roomId).query((rs, i) -> item(rs)).list();
    }

    /** The furniture of the Room where the student holds a Bed in the current Term. */
    @Transactional(readOnly = true)
    public MyFurniture mine() {
        currentUser.require(Role.STUDENT);
        long term = terms.publishedTerms().stream().filter(TermSummary::current).map(TermSummary::id).findFirst()
                .orElseThrow(() -> ApiException.notFound("You do not hold a Bed this Term."));
        BedOccupancy.Stay stay = occupancy.stayOf(currentUser.id(), term)
                .orElseThrow(() -> ApiException.notFound("You do not hold a Bed this Term."));
        record Room(long id, String code) {
        }
        Room room = jdbc.sql("SELECT r.id, r.code FROM inv_bed b JOIN inv_room r ON r.id = b.room_id WHERE b.id = :bed")
                .param("bed", stay.bedId()).query((rs, i) -> new Room(rs.getLong("id"), rs.getString("code"))).single();
        List<RoomItem> items = ofRoom(room.id()).stream()
                .map(i -> new RoomItem(i.assetCode(), i.type(), i.typeVi(), i.status())).toList();
        return new MyFurniture(room.code(), items);
    }

    // ---------------------------------------------------------------- helpers

    private void closeMove(long moveId, boolean done) {
        currentUser.require(Permission.MANAGE_FURNITURE);
        record Move(long id, long itemId, String status, Long fromRoom, Long fromStore, Long toRoom, Long toStore,
                String reason) {
        }
        Move move = jdbc.sql("SELECT * FROM inv_furniture_move WHERE id = :id FOR UPDATE").param("id", moveId)
                .query((rs, i) -> new Move(rs.getLong("id"), rs.getLong("item_id"), rs.getString("status"),
                        rs.getObject("from_room_id", Long.class), rs.getObject("from_store_building_id", Long.class),
                        rs.getObject("to_room_id", Long.class), rs.getObject("to_store_building_id", Long.class),
                        rs.getString("reason")))
                .optional().orElseThrow(() -> ApiException.notFound("This move does not exist."));
        Item item = lock(List.of(move.itemId())).getFirst();
        Place from = move.fromRoom() != null ? roomPlace(move.fromRoom()) : storePlace(move.fromStore());
        Place to = move.toRoom() != null ? roomPlace(move.toRoom()) : storePlace(move.toStore());
        Set<Long> scope = blockScope.resolve(null).ids();
        if (!scope.contains(from.buildingId()) && !scope.contains(to.buildingId())) {
            throw ApiException.forbidden("BLOCK_OUT_OF_SCOPE", "You do not have access to this Block.");
        }
        if (!"PLANNED".equals(move.status())) {
            throw ApiException.conflict("MOVE_CLOSED", "This move is already " + MOVE_STATUSES.get(move.status())
                    .toLowerCase(Locale.ROOT) + ".");
        }
        Timestamp now = Timestamp.from(Instant.now(clock));
        jdbc.sql("UPDATE inv_furniture_move SET status = :status, closed_by = :by, closed_at = :now WHERE id = :id")
                .param("status", done ? "DONE" : "CANCELLED").param("by", currentUser.id()).param("now", now)
                .param("id", moveId).update();
        if (done) {
            apply(item, to, move.reason(), now);
        }
        Map<String, Object> change = new LinkedHashMap<>();
        change.put("from", item.place().label());
        change.put("to", to.label());
        audit.record(done ? "FURNITURE_MOVED" : "FURNITURE_MOVE_CANCELLED", AuditLog.Tone.INFO, "Furniture item",
                item.id(), item.assetCode(), change);
    }

    /** Puts the item at its new place; In store items in a Room are In use, items in use in a store are In store. */
    private void apply(Item item, Place to, String reason, Timestamp now) {
        String status = item.status();
        if (to.roomId() == null && "IN_USE".equals(status)) {
            status = "IN_STORE";
        } else if (to.roomId() != null && "IN_STORE".equals(status)) {
            status = "IN_USE";
        }
        jdbc.sql("""
                UPDATE inv_furniture_item SET room_id = :room, store_building_id = :store, status = :status,
                       updated_at = :now, version = version + 1
                WHERE id = :id
                """)
                .param("room", to.roomId()).param("store", to.roomId() == null ? to.buildingId() : null)
                .param("status", status).param("now", now).param("id", item.id())
                .update();
        event(item.id(), "MOVED", item.place().label(), to.label(), reason);
    }

    /** A Room (by code) or the store of a Block (by code). */
    private Place target(String room, String block) {
        if (room != null && !room.isBlank()) {
            record Row(long id, long buildingId, String code, String block) {
            }
            Row r = jdbc.sql("""
                    SELECT r.id, r.building_id, r.code, b.code AS block FROM inv_room r JOIN inv_building b ON b.id = r.building_id
                    WHERE upper(r.code) = upper(:code) AND r.status <> 'RETIRED'
                    """).param("code", room.trim())
                    .query((rs, i) -> new Row(rs.getLong("id"), rs.getLong("building_id"), rs.getString("code"),
                            rs.getString("block")))
                    .optional().orElseThrow(() -> ApiException.notFound("Room " + room.trim() + " does not exist."));
            if (block != null && !block.isBlank() && !r.block().equalsIgnoreCase(block.trim())) {
                throw FieldErrors.single("room", "Room " + r.code() + " is not in Block " + block.trim() + ".");
            }
            return new Place(r.id(), r.buildingId(), r.code(), r.block());
        }
        long buildingId = blocks.findIdByCode(block.trim())
                .orElseThrow(() -> ApiException.notFound("Block " + block.trim() + " does not exist."));
        return storePlace(buildingId);
    }

    private Place roomPlace(long roomId) {
        return jdbc.sql("""
                SELECT r.id, r.building_id, r.code, b.code AS block FROM inv_room r JOIN inv_building b ON b.id = r.building_id
                WHERE r.id = :id
                """).param("id", roomId)
                .query((rs, i) -> new Place(rs.getLong("id"), rs.getLong("building_id"), rs.getString("code"),
                        rs.getString("block")))
                .single();
    }

    private Place storePlace(long buildingId) {
        String code = jdbc.sql("SELECT code FROM inv_building WHERE id = :id").param("id", buildingId)
                .query(String.class).single();
        return new Place(null, buildingId, null, code);
    }

    /** Items locked in id order, with where they are; an unknown id is 404. */
    private List<Item> lock(List<Long> ids) {
        List<Item> items = jdbc.sql("""
                SELECT i.id, i.asset_code, t.name, i.status, i.room_id, r.code AS room,
                       COALESCE(r.building_id, i.store_building_id) AS building_id, COALESCE(rb.code, sb.code) AS block
                FROM inv_furniture_item i JOIN inv_furniture_type t ON t.id = i.furniture_type_id
                LEFT JOIN inv_room r ON r.id = i.room_id LEFT JOIN inv_building rb ON rb.id = r.building_id
                LEFT JOIN inv_building sb ON sb.id = i.store_building_id
                WHERE i.id IN (:ids) ORDER BY i.id FOR UPDATE OF i
                """).param("ids", ids)
                .query((rs, i) -> new Item(rs.getLong("id"), rs.getString("asset_code"), rs.getString("name"),
                        rs.getString("status"), new Place(rs.getObject("room_id", Long.class), rs.getLong("building_id"),
                                rs.getString("room"), rs.getString("block"))))
                .list();
        if (items.size() != ids.size()) {
            throw ApiException.notFound("This furniture item does not exist.");
        }
        return items;
    }

    private long buildingOf(long itemId) {
        return jdbc.sql("""
                SELECT COALESCE(r.building_id, i.store_building_id) FROM inv_furniture_item i
                LEFT JOIN inv_room r ON r.id = i.room_id WHERE i.id = :id
                """).param("id", itemId).query(Long.class).single();
    }

    private void event(long itemId, String kind, String from, String to, String reason) {
        jdbc.sql("""
                INSERT INTO inv_furniture_event (item_id, kind, from_value, to_value, reason, by_user, at)
                VALUES (:item, :kind, :from, :to, :reason, :by, :now)
                """)
                .param("item", itemId).param("kind", kind).param("from", from).param("to", to).param("reason", reason)
                .param("by", currentUser.id()).param("now", Timestamp.from(Instant.now(clock)))
                .update();
    }

    private static FurnitureItem item(ResultSet rs) throws SQLException {
        long moveId = rs.getLong("move_id");
        PlannedMove move = rs.wasNull() ? null : new PlannedMove(String.valueOf(moveId),
                location(rs.getString("move_room"), rs.getString("move_block")), rs.getString("move_reason"));
        return new FurnitureItem(String.valueOf(rs.getLong("id")), rs.getString("asset_code"),
                String.valueOf(rs.getLong("furniture_type_id")), rs.getString("name"), rs.getString("name_vi"),
                AdminFurnitureService.CATEGORIES.get(rs.getString("category")), STATUSES.get(rs.getString("status")),
                location(rs.getString("room"), rs.getString("block")), rs.getString("note"), move,
                rs.getTimestamp("updated_at").toInstant());
    }

    private static Location location(String room, String block) {
        return new Location(room != null ? "Room" : "Store", room, block);
    }

    private static String statusCode(String label) {
        return STATUSES.entrySet().stream()
                .filter(e -> e.getValue().equalsIgnoreCase(label.trim()) || e.getKey().equalsIgnoreCase(label.trim()))
                .map(Map.Entry::getKey).findFirst().orElse(null);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }

    private static Map<String, String> statuses() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("IN_USE", "In use");
        m.put("BROKEN", "Broken");
        m.put("IN_REPAIR", "In repair");
        m.put("IN_STORE", "In store");
        m.put("DISPOSED", "Disposed");
        return m;
    }
}
