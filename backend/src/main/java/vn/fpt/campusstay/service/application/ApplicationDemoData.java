package vn.fpt.campusstay.service.application;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.demo.DemoData;
import vn.fpt.campusstay.common.demo.DemoScripts;

/**
 * Applications' demo part: the Applications of both Terms with their history and roommate invitations.
 */
@Component
class ApplicationDemoData implements DemoData {

    private final JdbcTemplate jdbc;

    ApplicationDemoData(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int order() {
        return 40;
    }

    @Override
    public void clear() {
        jdbc.execute("DELETE FROM app_round2_option");
        jdbc.execute("DELETE FROM app_round2_offer");
        jdbc.execute("DELETE FROM app_roommate_check");
        jdbc.execute("DELETE FROM app_roommate_invitation");
        jdbc.execute("DELETE FROM app_application_event");
        jdbc.execute("DELETE FROM app_application");
    }

    @Override
    public void load(Stage stage) {
        DemoScripts.run(jdbc, "app.sql", stage);
    }
}
