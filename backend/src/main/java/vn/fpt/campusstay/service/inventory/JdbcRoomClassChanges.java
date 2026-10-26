package vn.fpt.campusstay.service.inventory;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;

/**
 * Implements {@link RoomClassChanges}. Class-defining items count in the Room while In use, Broken or In repair (as
 * {@link RoomConformance}); items already planned to move in or out count as moved, so a second check sees the
 * reservation. Free store items are those In store without a planned move.
 */
@Component
class JdbcRoomClassChanges implements RoomClassChanges {

    private record Type(long id, String name, String nameVi) {
    }

    private record Room(long id, String code, long buildingId, String block) {
    }

    private final JdbcClient jdbc;
    private final RoomConformance conformance;
    private final AuditLog audit;
    private final Clock clock;

    JdbcRoomClassChanges(JdbcClient jdbc, RoomConformance conformance, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.conformance = conformance;
        this.audit = audit;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public long classOf(long roomId, long termId) {
        return jdbc.sql("SELECT inv_room_class_in(:room, :term)").param("room", roomId).param("term", termId)
                .query(Long.class).single();
    }

    @Override
    @Transactional(readOnly = true)
    public Check check(long roomId, long termId, long toClassId) {
        return compute(room(roomId, false), termId, toClassId);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Check apply(long roomId, long termId, long toClassId, long by, String reference) {
        Room room = room(roomId, true);
        Check check = compute(room, termId, toClassId);
        if (!check.enough()) {
            StringBuilder lacks = new StringBuilder();
            for (Need n : check.missing()) {
                if (n.available() < n.quantity()) {
                    lacks.append(lacks.isEmpty() ? "" : ", ").append(n.quantity() - n.available()).append(" × ")
                            .append(n.type());
                }
            }
            throw ApiException.conflict("FURNITURE_MISSING", "The store of Block " + room.block()
                    + " does not have the furniture this Room Class needs: " + lacks + ".");
        }
        Instant now = Instant.now(clock);
        jdbc.sql("""
                INSERT INTO inv_room_class_term (room_id, term_id, room_class_id, set_by, set_at)
                VALUES (:room, :term, :class, :by, :now)
                ON CONFLICT (room_id, term_id) DO UPDATE SET room_class_id = EXCLUDED.room_class_id,
                    set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at
                """).param("room", room.id()).param("term", termId).param("class", toClassId).param("by", by)
                .param("now", Timestamp.from(now)).update();
        List<String> reserved = new ArrayList<>();
        for (Need n : check.missing()) {
            List<Object[]> items = jdbc.sql("""
                    SELECT i.id, i.asset_code FROM inv_furniture_item i
                    WHERE i.furniture_type_id = :type AND i.store_building_id = :block AND i.status = 'IN_STORE'
                      AND NOT EXISTS (SELECT 1 FROM inv_furniture_move m WHERE m.item_id = i.id AND m.status = 'PLANNED')
                    ORDER BY i.id LIMIT :n FOR UPDATE OF i
                    """).param("type", Long.parseLong(n.typeId())).param("block", room.buildingId())
                    .param("n", n.quantity())
                    .query((rs, i) -> new Object[] { rs.getLong("id"), rs.getString("asset_code") }).list();
            for (Object[] item : items) {
                plan((long) item[0], null, room.buildingId(), room.id(), null,
                        reference + ": reserved for Room " + room.code(), by, now);
                reserved.add((String) item[1]);
            }
        }
        List<String> removing = new ArrayList<>();
        for (Need n : check.extra()) {
            List<Object[]> items = jdbc.sql("""
                    SELECT i.id, i.asset_code FROM inv_furniture_item i
                    WHERE i.furniture_type_id = :type AND i.room_id = :room AND i.status IN ('IN_USE', 'BROKEN', 'IN_REPAIR')
                      AND NOT EXISTS (SELECT 1 FROM inv_furniture_move m WHERE m.item_id = i.id AND m.status = 'PLANNED')
                    ORDER BY i.id DESC LIMIT :n FOR UPDATE OF i
                    """).param("type", Long.parseLong(n.typeId())).param("room", room.id()).param("n", n.quantity())
                    .query((rs, i) -> new Object[] { rs.getLong("id"), rs.getString("asset_code") }).list();
            for (Object[] item : items) {
                plan((long) item[0], room.id(), null, null, room.buildingId(),
                        reference + ": remove from Room " + room.code(), by, now);
                removing.add((String) item[1]);
            }
        }
        Map<String, Object> change = new LinkedHashMap<>();
        change.put("term", termId);
        change.put("roomClass", List.of(check.fromClassId(), toClassId));
        change.put("reference", reference);
        change.put("reserved", reserved);
        change.put("removing", removing);
        audit.record("ROOM_CLASS_SET", AuditLog.Tone.INFO, "Room", room.id(), room.code(), change);
        return new Check(check.roomId(), check.room(), check.fromClassId(), check.toClassId(), check.missing(),
                check.extra(), true, reserved, removing);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void setBack(long roomId, long termId, long classId, long by, String reference) {
        Room room = room(roomId, true);
        Instant now = Instant.now(clock);
        jdbc.sql("""
                INSERT INTO inv_room_class_term (room_id, term_id, room_class_id, set_by, set_at)
                VALUES (:room, :term, :class, :by, :now)
                ON CONFLICT (room_id, term_id) DO UPDATE SET room_class_id = EXCLUDED.room_class_id,
                    set_by = EXCLUDED.set_by, set_at = EXCLUDED.set_at
                """).param("room", room.id()).param("term", termId).param("class", classId).param("by", by)
                .param("now", Timestamp.from(now)).update();
        int cancelled = jdbc.sql("""
                UPDATE inv_furniture_move SET status = 'CANCELLED', closed_by = :by, closed_at = :now
                WHERE status = 'PLANNED' AND reason LIKE :reference || ':%'
                """).param("by", by).param("now", Timestamp.from(now)).param("reference", reference).update();
        audit.record("ROOM_CLASS_SET_BACK", AuditLog.Tone.WARNING, "Room", room.id(), room.code(),
                Map.of("term", termId, "roomClass", classId, "reference", reference, "plannedMovesCancelled", cancelled));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, Boolean> conforms(long termId, Collection<Long> roomIds) {
        Map<Long, Boolean> result = new HashMap<>();
        if (roomIds.isEmpty()) {
            return result;
        }
        Map<Long, Long> classes = new HashMap<>();
        jdbc.sql("SELECT id, inv_room_class_in(id, :term) AS class_id FROM inv_room WHERE id IN (:rooms)")
                .param("term", termId).param("rooms", List.copyOf(roomIds))
                .query((rs, i) -> Map.entry(rs.getLong("id"), rs.getLong("class_id"))).list()
                .forEach(e -> classes.put(e.getKey(), e.getValue()));
        conformance.of(classes).forEach((room, c) -> result.put(room, c.status().equals(RoomConformance.MATCHES)));
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public List<Long> changingClass(long termId, long previousTermId) {
        return jdbc.sql("""
                SELECT room_id FROM inv_room_class_term
                WHERE term_id = :term AND room_class_id <> inv_room_class_in(room_id, :previous)
                """).param("term", termId).param("previous", previousTermId).query(Long.class).list();
    }

    // ---------------------------------------------------------------- helpers

    private Check compute(Room room, long termId, long toClassId) {
        long fromClass = classOf(room.id(), termId);
        Map<Long, Type> types = new LinkedHashMap<>();
        jdbc.sql("SELECT id, name, name_vi FROM inv_furniture_type WHERE defines_class ORDER BY sort_order, name")
                .query((rs, i) -> new Type(rs.getLong("id"), rs.getString("name"), rs.getString("name_vi"))).list()
                .forEach(t -> types.put(t.id(), t));
        Map<Long, Integer> need = new HashMap<>();
        jdbc.sql("SELECT furniture_type_id, quantity FROM inv_room_class_requirement WHERE room_class_id = :c")
                .param("c", toClassId)
                .query((rs, i) -> Map.entry(rs.getLong("furniture_type_id"), rs.getInt("quantity"))).list()
                .forEach(e -> need.put(e.getKey(), e.getValue()));
        Map<Long, Integer> have = counts("""
                SELECT i.furniture_type_id, count(*) FROM inv_furniture_item i
                WHERE i.room_id = :room AND i.status IN ('IN_USE', 'BROKEN', 'IN_REPAIR')
                  AND NOT EXISTS (SELECT 1 FROM inv_furniture_move m WHERE m.item_id = i.id AND m.status = 'PLANNED'
                                  AND m.from_room_id = :room)
                GROUP BY i.furniture_type_id
                """, room);
        Map<Long, Integer> coming = counts("""
                SELECT i.furniture_type_id, count(*) FROM inv_furniture_move m JOIN inv_furniture_item i ON i.id = m.item_id
                WHERE m.status = 'PLANNED' AND m.to_room_id = :room
                GROUP BY i.furniture_type_id
                """, room);
        Map<Long, Integer> store = counts("""
                SELECT i.furniture_type_id, count(*) FROM inv_furniture_item i
                WHERE i.store_building_id = :block AND i.status = 'IN_STORE'
                  AND NOT EXISTS (SELECT 1 FROM inv_furniture_move m WHERE m.item_id = i.id AND m.status = 'PLANNED')
                GROUP BY i.furniture_type_id
                """, room);
        List<Need> missing = new ArrayList<>();
        List<Need> extra = new ArrayList<>();
        boolean enough = true;
        for (Type t : types.values()) {
            int diff = have.getOrDefault(t.id(), 0) + coming.getOrDefault(t.id(), 0) - need.getOrDefault(t.id(), 0);
            if (diff < 0) {
                int available = store.getOrDefault(t.id(), 0);
                missing.add(new Need(String.valueOf(t.id()), t.name(), t.nameVi(), -diff, available));
                enough &= available >= -diff;
            } else if (diff > 0) {
                extra.add(new Need(String.valueOf(t.id()), t.name(), t.nameVi(), diff, 0));
            }
        }
        return new Check(room.id(), room.code(), fromClass, toClassId, missing, extra, enough, List.of(), List.of());
    }

    private Map<Long, Integer> counts(String sql, Room room) {
        Map<Long, Integer> result = new HashMap<>();
        var spec = jdbc.sql(sql);
        if (sql.contains(":room")) {
            spec = spec.param("room", room.id());
        }
        if (sql.contains(":block")) {
            spec = spec.param("block", room.buildingId());
        }
        spec.query((rs, i) -> Map.entry(rs.getLong(1), rs.getInt(2))).list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    private void plan(long itemId, Long fromRoom, Long fromStore, Long toRoom, Long toStore, String reason, long by,
            Instant now) {
        jdbc.sql("""
                INSERT INTO inv_furniture_move (item_id, from_room_id, from_store_building_id, to_room_id,
                                                to_store_building_id, reason, status, created_by, created_at)
                VALUES (:item, :fromRoom, :fromStore, :toRoom, :toStore, :reason, 'PLANNED', :by, :now)
                """).param("item", itemId).param("fromRoom", fromRoom).param("fromStore", fromStore)
                .param("toRoom", toRoom).param("toStore", toStore).param("reason", reason).param("by", by)
                .param("now", Timestamp.from(now)).update();
    }

    private Room room(long roomId, boolean lock) {
        return jdbc.sql("""
                SELECT r.id, r.code, r.building_id, b.code AS block FROM inv_room r JOIN inv_building b ON b.id = r.building_id
                WHERE r.id = :id""" + (lock ? " FOR UPDATE OF r" : ""))
                .param("id", roomId)
                .query((rs, i) -> new Room(rs.getLong("id"), rs.getString("code"), rs.getLong("building_id"),
                        rs.getString("block")))
                .optional().orElseThrow(() -> ApiException.notFound("This Room does not exist."));
    }
}
