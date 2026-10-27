package vn.fpt.campusstay.service.billing;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.service.inventory.RoomRecords;

/** The Room hub's meter readings, newest period first (implements Inventory's {@link RoomRecords}). */
@Component
@Transactional(readOnly = true)
class MeterRecords implements RoomRecords {

    private static final Map<String, String> STATUSES = Map.of("MISSING", "Missing", "ENTERED", "Entered",
            "CHECK_VALUE", "Check value", "CONFIRMED", "Confirmed");

    private final JdbcClient jdbc;

    MeterRecords(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public String section() {
        return "meterReadings";
    }

    @Override
    public List<Item> of(long roomId, int limit) {
        return jdbc.sql("""
                SELECT p.id, p.label, p.period_end, r.electricity_prev, r.electricity_curr, r.water_prev, r.water_curr,
                       r.status, r.entered_at
                FROM bil_meter_reading r JOIN bil_meter_period p ON p.id = r.period_id
                WHERE r.room_id = :room ORDER BY p.period_start DESC LIMIT :limit
                """).param("room", roomId).param("limit", limit)
                .query((rs, i) -> {
                    Timestamp entered = rs.getTimestamp("entered_at");
                    return new Item("meter-reading", String.valueOf(rs.getLong("id")), rs.getString("label"),
                            "Electricity " + reading(rs.getBigDecimal("electricity_prev"),
                                    rs.getBigDecimal("electricity_curr")) + " kWh · Water "
                                    + reading(rs.getBigDecimal("water_prev"), rs.getBigDecimal("water_curr")) + " m³",
                            STATUSES.get(rs.getString("status")),
                            entered != null ? entered.toInstant()
                                    : rs.getDate("period_end").toLocalDate().atStartOfDay(TimeConfig.CAMPUS_ZONE)
                                            .toInstant());
                })
                .list();
    }

    private static String reading(BigDecimal previous, BigDecimal current) {
        return previous.stripTrailingZeros().toPlainString() + " → "
                + (current == null ? "…" : current.stripTrailingZeros().toPlainString());
    }
}
