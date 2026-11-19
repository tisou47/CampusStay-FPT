package vn.fpt.campusstay.service.maintenance;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.demo.DemoData;
import vn.fpt.campusstay.common.demo.DemoScripts;

/**
 * Maintenance's demo part: Maintenance Requests and inspection runs (checklists and schedules stay).
 */
@Component
class MaintenanceDemoData implements DemoData {

    private final JdbcTemplate jdbc;

    MaintenanceDemoData(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public int order() {
        return 70;
    }

    @Override
    public void clear() {
        jdbc.execute("DELETE FROM mnt_inspection_result");
        jdbc.execute("DELETE FROM mnt_inspection_room_check");
        jdbc.execute("DELETE FROM mnt_inspection_room");
        jdbc.execute("DELETE FROM mnt_inspection_run");
        jdbc.execute("DELETE FROM mnt_inspection_schedule WHERE name LIKE '% (demo)' OR name LIKE 'Pre-arrival check%' OR name LIKE 'Kiểm tra phòng trước nhận phòng%' OR name LIKE 'Kiểm tra định kỳ điện nước & PCCC%'");
        jdbc.execute("DELETE FROM mnt_checklist_item WHERE checklist_id IN (SELECT id FROM mnt_checklist WHERE family_key IN ('DEMO_TURNOVER', 'CL_FIRE_SAFETY', 'CL_PLUMBING_AC', 'CL_HYGIENE_FURNITURE'))");
        jdbc.execute("DELETE FROM mnt_checklist WHERE family_key IN ('DEMO_TURNOVER', 'CL_FIRE_SAFETY', 'CL_PLUMBING_AC', 'CL_HYGIENE_FURNITURE')");
        jdbc.execute("DELETE FROM mnt_request_photo");
        jdbc.execute("DELETE FROM mnt_request_event");
        jdbc.execute("DELETE FROM mnt_request");
    }

    @Override
    public void load(Stage stage) {
        DemoScripts.run(jdbc, "mnt.sql", stage);
    }
}
