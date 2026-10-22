package vn.fpt.campusstay.service.setting;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.setting.Catalog;

@Component
@Transactional(readOnly = true)
class JdbcCatalog implements Catalog {

    private final JdbcClient jdbc;

    JdbcCatalog(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<RoomTypeInfo> roomTypes() {
        return jdbc.sql("""
                SELECT id, name, beds, base_price, status, description, roommate_selection
                FROM cfg_room_type ORDER BY sort_order, beds, name
                """)
                .query((rs, i) -> new RoomTypeInfo(rs.getLong("id"), rs.getString("name"), rs.getInt("beds"),
                        rs.getLong("base_price"), "ACTIVE".equals(rs.getString("status")), rs.getString("description"),
                        "MUTUAL".equals(rs.getString("roommate_selection"))))
                .list();
    }

    @Override
    public List<RoomClassInfo> roomClasses() {
        return jdbc.sql("""
                SELECT id, name, surcharge_rate, amenities, status FROM cfg_room_class ORDER BY sort_order, name
                """)
                .query((rs, i) -> new RoomClassInfo(rs.getLong("id"), rs.getString("name"),
                        rs.getBigDecimal("surcharge_rate"), strings(rs, "amenities"),
                        "ACTIVE".equals(rs.getString("status"))))
                .list();
    }

    static List<String> strings(ResultSet rs, String column) throws SQLException {
        Array array = rs.getArray(column);
        return array == null ? List.of() : List.of((String[]) array.getArray());
    }
}
