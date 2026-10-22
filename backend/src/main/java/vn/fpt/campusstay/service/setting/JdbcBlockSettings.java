package vn.fpt.campusstay.service.setting;

import java.time.LocalTime;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.setting.BlockSettings;

@Component
@Transactional(readOnly = true)
class JdbcBlockSettings implements BlockSettings {

    private final JdbcClient jdbc;

    JdbcBlockSettings(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<Settings> forBlock(long buildingId) {
        return jdbc.sql("SELECT desk_opens, desk_closes, house_rules FROM cfg_block_settings WHERE building_id = :id")
                .param("id", buildingId)
                .query((rs, i) -> new Settings(rs.getObject("desk_opens", LocalTime.class),
                        rs.getObject("desk_closes", LocalTime.class), rs.getString("house_rules")))
                .optional();
    }
}
