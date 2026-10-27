package vn.fpt.campusstay.service.request;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.demo.DemoData;
import vn.fpt.campusstay.common.demo.DemoScripts;

/**
 * Requests' demo part: next-Term room changes, swaps, Room Class changes with consents, extension and end-of-stay
 * requests, and the escalations, which the SLA scan opens right away for the overdue Maintenance Request
 * (routing rules and SLA timers are Block settings and stay).
 */
@Component
class RequestDemoData implements DemoData {

    private final JdbcTemplate jdbc;
    private final EscalationService escalations;

    RequestDemoData(JdbcTemplate jdbc, EscalationService escalations) {
        this.jdbc = jdbc;
        this.escalations = escalations;
    }

    @Override
    public int order() {
        return 80;
    }

    @Override
    public void clear() {
        jdbc.execute("DELETE FROM req_escalation_event");
        jdbc.execute("DELETE FROM req_escalation");
        jdbc.execute("DELETE FROM req_room_class_consent");
        jdbc.execute("DELETE FROM req_room_class_change");
        jdbc.execute("DELETE FROM req_stay_request");
        jdbc.execute("DELETE FROM req_swap");
        jdbc.execute("DELETE FROM req_swap_post");
        jdbc.execute("DELETE FROM req_room_change");
    }

    @Override
    public void load(Stage stage) {
        DemoScripts.run(jdbc, "req.sql", stage);
        escalations.scan();
    }
}
