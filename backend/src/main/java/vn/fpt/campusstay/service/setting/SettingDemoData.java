package vn.fpt.campusstay.service.setting;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.demo.DemoData;
import vn.fpt.campusstay.common.demo.DemoScripts;

/**
 * Settings' demo part: the two Terms of the demo, their prices and Blocks, and the registration-period
 * requests. Room Types, Room Classes, fees, rules and parameters are configuration and stay.
 */
@Component
class SettingDemoData implements DemoData {

    private final JdbcTemplate jdbc;

    SettingDemoData(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int order() {
        return 10;
    }

    @Override
    public void clear() {
        jdbc.execute("DELETE FROM cfg_term_request_event");
        jdbc.execute("DELETE FROM cfg_term_request");
        jdbc.execute("DELETE FROM cfg_term_room_excluded");
        jdbc.execute("DELETE FROM cfg_term_price");
        jdbc.execute("DELETE FROM cfg_term_block");
        jdbc.execute("DELETE FROM cfg_term_room_type");
        jdbc.execute("DELETE FROM cfg_term_room_class");
        jdbc.execute("DELETE FROM cfg_term");
    }

    @Override
    public void load(Stage stage) {
        DemoScripts.run(jdbc, "cfg.sql", stage);
    }
}
