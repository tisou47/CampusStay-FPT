package vn.fpt.campusstay.service.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.demo.DemoData;
import vn.fpt.campusstay.common.demo.DemoScripts;

/**
 * Accounts' demo part: enrollment reconciliations and student list imports are cleared; accounts stay, and
 * the fictional students get back their verified and enrolled state (one waits for verification).
 */
@Component
class AuthDemoData implements DemoData {

    private final JdbcTemplate jdbc;

    AuthDemoData(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int order() {
        return 30;
    }

    @Override
    public void clear() {
        jdbc.execute("DELETE FROM auth_reconciliation_item");
        jdbc.execute("DELETE FROM auth_reconciliation");
        jdbc.execute("DELETE FROM auth_student_import_row");
        jdbc.execute("DELETE FROM auth_student_import");
        // Fictional students go back to their base state (active, verified, enrolled); real accounts are never touched.
        jdbc.execute("UPDATE auth_user SET status = 'ACTIVE', failed_attempts = 0, locked_until = NULL WHERE demo AND role = 'STUDENT' AND (status <> 'ACTIVE' OR failed_attempts > 0 OR locked_until IS NOT NULL)");
        jdbc.execute("UPDATE auth_student s SET verification = 'VERIFIED', verification_note = NULL, enrollment_status = 'ENROLLED' FROM auth_user u WHERE u.id = s.user_id AND u.demo AND (s.verification <> 'VERIFIED' OR s.enrollment_status <> 'ENROLLED' OR s.verification_note IS NOT NULL)");
    }

    @Override
    public void load(Stage stage) {
        DemoScripts.run(jdbc, "auth.sql", stage);
    }
}
