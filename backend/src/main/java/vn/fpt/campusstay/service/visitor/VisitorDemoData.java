package vn.fpt.campusstay.service.visitor;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.demo.DemoData;

/**
 * Family Days' demo part: the reset clears them (they point at students and Buildings); no stage loads one, a Manager
 * creates the Family Day during the demo.
 */
@Component
class VisitorDemoData implements DemoData {

    private final JdbcTemplate jdbc;

    VisitorDemoData(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int order() {
        return 95;
    }

    @Override
    public void clear() {
        jdbc.execute("DELETE FROM vis_visitor");
        jdbc.execute("DELETE FROM vis_registration");
        jdbc.execute("DELETE FROM vis_time_slot");
        jdbc.execute("DELETE FROM vis_family_day");
    }

    @Override
    public void load(Stage stage) {
        // Nothing to load: see the class comment.
    }
}
