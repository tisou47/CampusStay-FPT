package vn.fpt.campusstay.service.assignment;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.demo.DemoData;
import vn.fpt.campusstay.common.demo.DemoScripts;

/**
 * Assignment's demo part: runs, Stays, Allocations, the requests window, late check-ins, terminations,
 * operational moves and check-outs.
 */
@Component
class AssignmentDemoData implements DemoData {

    private final JdbcTemplate jdbc;

    AssignmentDemoData(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int order() {
        return 50;
    }

    @Override
    public void clear() {
        jdbc.execute("DELETE FROM asg_check_out_damage");
        jdbc.execute("DELETE FROM asg_check_out");
        jdbc.execute("DELETE FROM asg_late_check_in");
        jdbc.execute("DELETE FROM asg_termination");
        jdbc.execute("DELETE FROM asg_move");
        jdbc.execute("DELETE FROM asg_proposal_item");
        jdbc.execute("DELETE FROM asg_run_block");
        jdbc.execute("DELETE FROM asg_allocation");
        jdbc.execute("DELETE FROM asg_renewal");
        jdbc.execute("DELETE FROM asg_stay");
        jdbc.execute("DELETE FROM asg_run");
    }

    @Override
    public void load(Stage stage) {
        DemoScripts.run(jdbc, "asg.sql", stage);
    }
}
