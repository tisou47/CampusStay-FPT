package vn.fpt.campusstay.service.inventory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.setting.RoomClassFurniture;

@Component
class JdbcRoomClassFurniture implements RoomClassFurniture {

    private final JdbcClient jdbc;

    JdbcRoomClassFurniture(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, List<Line>> required() {
        Map<Long, List<Line>> result = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT q.room_class_id, t.name, t.name_vi, q.quantity FROM inv_room_class_requirement q
                JOIN inv_furniture_type t ON t.id = q.furniture_type_id
                ORDER BY t.sort_order, t.name
                """)
                .query((rs, i) -> Map.entry(rs.getLong("room_class_id"),
                        new Line(rs.getString("name"), rs.getString("name_vi"), rs.getInt("quantity"))))
                .list()
                .forEach(e -> result.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        return result;
    }
}
