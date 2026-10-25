package vn.fpt.campusstay.service.inventory;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Furniture conformance (spec §6.19): a Room matches a Room Class when it has at least the items each
 * requirement of the class asks for and no more class-defining items than that (an extra air conditioner in a
 * Basic Room is the loophole of §14). Items in the Room count while In use, Broken or In repair; items in a
 * store or disposed do not.
 */
@Component
@Transactional(readOnly = true)
class RoomConformance {

    static final String MATCHES = "Matches";
    static final String DOES_NOT_MATCH = "Does not match";

    private record Type(long id, String name, String nameVi) {
    }

    private final JdbcClient jdbc;

    RoomConformance(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Room id → its conformance with the given class, for each Room of {@code classByRoom}. */
    Map<Long, RoomClassService.Conformance> of(Map<Long, Long> classByRoom) {
        Map<Long, RoomClassService.Conformance> result = new HashMap<>();
        if (classByRoom.isEmpty()) {
            return result;
        }
        Map<Long, Type> types = new LinkedHashMap<>();
        jdbc.sql("SELECT id, name, name_vi FROM inv_furniture_type WHERE defines_class ORDER BY sort_order, name")
                .query((rs, i) -> new Type(rs.getLong("id"), rs.getString("name"), rs.getString("name_vi")))
                .list()
                .forEach(t -> types.put(t.id(), t));
        Map<Long, Map<Long, Integer>> required = new HashMap<>();
        jdbc.sql("SELECT room_class_id, furniture_type_id, quantity FROM inv_room_class_requirement")
                .query((rs, i) -> new long[] { rs.getLong("room_class_id"), rs.getLong("furniture_type_id"),
                        rs.getInt("quantity") })
                .list()
                .forEach(r -> required.computeIfAbsent(r[0], k -> new HashMap<>()).put(r[1], (int) r[2]));
        Map<Long, Map<Long, Integer>> present = present(classByRoom.keySet());
        classByRoom.forEach((room, roomClass) -> {
            Map<Long, Integer> need = required.getOrDefault(roomClass, Map.of());
            Map<Long, Integer> have = present.getOrDefault(room, Map.of());
            List<RoomClassService.ItemCount> missing = new ArrayList<>();
            List<RoomClassService.ItemCount> extra = new ArrayList<>();
            types.values().forEach(t -> {
                int diff = have.getOrDefault(t.id(), 0) - need.getOrDefault(t.id(), 0);
                if (diff < 0) {
                    missing.add(new RoomClassService.ItemCount(String.valueOf(t.id()), t.name(), t.nameVi(), -diff));
                } else if (diff > 0) {
                    extra.add(new RoomClassService.ItemCount(String.valueOf(t.id()), t.name(), t.nameVi(), diff));
                }
            });
            result.put(room, new RoomClassService.Conformance(missing.isEmpty() && extra.isEmpty() ? MATCHES
                    : DOES_NOT_MATCH, missing, extra));
        });
        return result;
    }

    /** Room id → class-defining type id → items in the Room. */
    private Map<Long, Map<Long, Integer>> present(Collection<Long> rooms) {
        Map<Long, Map<Long, Integer>> result = new HashMap<>();
        jdbc.sql("""
                SELECT i.room_id, i.furniture_type_id, count(*) AS n
                FROM inv_furniture_item i JOIN inv_furniture_type t ON t.id = i.furniture_type_id
                WHERE t.defines_class AND i.room_id IN (:rooms) AND i.status IN ('IN_USE', 'BROKEN', 'IN_REPAIR')
                GROUP BY i.room_id, i.furniture_type_id
                """)
                .param("rooms", List.copyOf(rooms))
                .query((rs, i) -> new long[] { rs.getLong("room_id"), rs.getLong("furniture_type_id"), rs.getLong("n") })
                .list()
                .forEach(r -> result.computeIfAbsent(r[0], k -> new HashMap<>()).put(r[1], (int) r[2]));
        return result;
    }
}
