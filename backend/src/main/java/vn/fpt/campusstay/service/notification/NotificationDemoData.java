package vn.fpt.campusstay.service.notification;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.demo.DemoData;
import vn.fpt.campusstay.common.demo.DemoScripts;

/**
 * Notifications' demo part: announcements, in-app notifications, Admin emails and the email outbox
 * (templates and devices stay).
 */
@Component
class NotificationDemoData implements DemoData {

    private final JdbcTemplate jdbc;

    NotificationDemoData(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int order() {
        return 90;
    }

    @Override
    public void clear() {
        jdbc.execute("DELETE FROM ntf_announcement_read");
        jdbc.execute("DELETE FROM ntf_announcement_block");
        jdbc.execute("DELETE FROM ntf_announcement");
        jdbc.execute("DELETE FROM ntf_notification");
        jdbc.execute("DELETE FROM ntf_email_outbox");
        jdbc.execute("DELETE FROM ntf_email_campaign");
    }

    @Override
    public void load(Stage stage) {
        DemoScripts.run(jdbc, "ntf.sql", stage);
    }
}
