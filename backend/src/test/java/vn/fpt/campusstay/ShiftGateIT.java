package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Staff shifts set by a Manager, the confirmation a Staff member gives before a change outside their shift or their
 * work, and the record Managers read (TC-AUTH-071…075). The gate is on here only (the test profile turns it off).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@TestPropertySource(properties = "campusstay.auth.shift-gate=true")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ShiftGateIT {

    private static final AtomicInteger SEQ = new AtomicInteger();
    /** A change of the Maintenance kind; the request does not exist, so the call changes nothing once let through. */
    private static final String CHANGE = "/maintenance-requests/999999/updates";
    /** Every day, all day: 00:00–23:59 and 23:59 past midnight. */
    private static final String ALWAYS;

    static {
        StringBuilder b = new StringBuilder("{\"shifts\":[");
        for (int d = 1; d <= 7; d++) {
            b.append(d > 1 ? "," : "").append("{\"weekday\":").append(d).append(",\"start\":\"00:00\",\"end\":\"23:59\"},")
                    .append("{\"weekday\":").append(d).append(",\"start\":\"23:59\",\"end\":\"00:00\"}");
        }
        ALWAYS = b.append("]}").toString();
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    /** A Staff member of Block A who handles the given kinds (codes); returns { id, email }. */
    private String[] staff(String name, String handles) {
        String email = "sh" + SEQ.incrementAndGet() + "@campusstay.test";
        long id = jdbc.sql("""
                INSERT INTO auth_user (email, display_name, password_hash, role, title)
                SELECT :email, :name, password_hash, 'STAFF', 'Maintenance Technician' FROM auth_user
                WHERE email = 'staff.a1@campusstay.test' RETURNING id
                """).param("email", email).param("name", name).query(Long.class).single();
        jdbc.sql("INSERT INTO auth_user_block (user_id, building_id) SELECT :id, id FROM inv_building WHERE code = 'A'")
                .param("id", id).update();
        jdbc.sql("INSERT INTO auth_staff_profile (user_id, handles) VALUES (:id, string_to_array(:h, ','))")
                .param("id", id).param("h", handles).update();
        return new String[] { String.valueOf(id), email };
    }

    private ResultActions shifts(String auth, String id, String body) throws Exception {
        return mvc.perform(put("/block-staff/" + id + "/shifts").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions change(String auth, boolean acknowledged) throws Exception {
        var request = post(CHANGE).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content("{\"note\":\"x\"}");
        if (acknowledged) {
            request.header("X-Shift-Acknowledged", "true");
        }
        return mvc.perform(request);
    }

    private long recorded(String id, String where) {
        return jdbc.sql("SELECT count(*) FROM auth_staff_activity WHERE user_id = :id AND " + where)
                .param("id", Long.parseLong(id)).query(Long.class).single();
    }

    /** TC-AUTH-071: a Manager sets a Staff member's weekly shifts; bad shifts 400; the list shows them; audited. */
    @Test
    void managerSetsWeeklyShifts() throws Exception {
        String[] p = staff("Shift Person", "MAINTENANCE");
        String manager = bearer(mvc, MANAGER_A);
        shifts(manager, p[0], "{\"shifts\":[{\"weekday\":1,\"start\":\"07:00\",\"end\":\"15:00\"},"
                + "{\"weekday\":5,\"start\":\"22:00\",\"end\":\"06:00\"}]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shifts[0].weekday").value(1))
                .andExpect(jsonPath("$.shifts[1].end").value("06:00"));
        mvc.perform(get("/block-staff").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(jsonPath("$.items[?(@.name == 'Shift Person')].shifts[0].start").value(hasItem("07:00")));
        shifts(manager, p[0], "{\"shifts\":[{\"weekday\":8,\"start\":\"07:00\",\"end\":\"15:00\"}]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.shifts").exists());
        shifts(manager, p[0], "{\"shifts\":[{\"weekday\":1,\"start\":\"7h\",\"end\":\"15:00\"}]}")
                .andExpect(status().isBadRequest());
        shifts(manager, p[0], "{\"shifts\":[{\"weekday\":1,\"start\":\"07:00\",\"end\":\"07:00\"}]}")
                .andExpect(status().isBadRequest());
        shifts(bearer(mvc, STAFF_A), p[0], ALWAYS).andExpect(status().isForbidden());
        shifts(manager, String.valueOf(jdbc.sql("SELECT id FROM auth_user WHERE email = :e").param("e", MANAGER_B)
                .query(Long.class).single()), ALWAYS).andExpect(status().isNotFound());
        assertThat(jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE action = 'STAFF_SHIFTS_UPDATED' AND object_id = :id")
                .param("id", p[0]).query(Long.class).single()).isEqualTo(1);
    }

    /** TC-AUTH-072: without a shift, a change answers 428 and does nothing until confirmed; then it is recorded flagged. */
    @Test
    void outsideTheShiftAChangeNeedsConfirmation() throws Exception {
        String[] p = staff("Night Person", "MAINTENANCE");
        String staff = bearer(mvc, p[1]);
        change(staff, false).andExpect(status().isPreconditionRequired())
                .andExpect(jsonPath("$.code").value("SHIFT_CONFIRM_REQUIRED"))
                .andExpect(jsonPath("$.details.outOfShift").value(true))
                .andExpect(jsonPath("$.details.roleMismatch").value(false));
        assertThat(recorded(p[0], "TRUE")).isZero();
        change(staff, true).andExpect(status().is4xxClientError());
        assertThat(recorded(p[0], "NOT in_shift AND role_match AND acknowledged AND handle = 'MAINTENANCE'")).isEqualTo(1);
        // Reading is never checked nor recorded.
        mvc.perform(get("/maintenance-requests").header(HttpHeaders.AUTHORIZATION, staff)).andExpect(status().isOk());
        assertThat(recorded(p[0], "TRUE")).isEqualTo(1);
    }

    /** TC-AUTH-073: inside the shift and the person's work, a change goes through without a question and is recorded. */
    @Test
    void insideShiftAndWorkNoQuestion() throws Exception {
        String[] p = staff("Day Person", "MAINTENANCE");
        shifts(bearer(mvc, MANAGER_A), p[0], ALWAYS).andExpect(status().isOk());
        String staff = bearer(mvc, p[1]);
        change(staff, false).andExpect(status().is4xxClientError());
        assertThat(recorded(p[0], "in_shift AND role_match AND NOT acknowledged")).isEqualTo(1);
        mvc.perform(get("/block-staff/me").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.inShift").value(true)).andExpect(jsonPath("$.shiftToday").isString());
    }

    /** TC-AUTH-074: inside the shift but not the person's kind of work: 428 with roleMismatch, then recorded flagged. */
    @Test
    void otherWorkInsideTheShiftNeedsConfirmation() throws Exception {
        String[] p = staff("Desk Person", "DESK");
        shifts(bearer(mvc, MANAGER_A), p[0], ALWAYS).andExpect(status().isOk());
        String staff = bearer(mvc, p[1]);
        change(staff, false).andExpect(status().isPreconditionRequired())
                .andExpect(jsonPath("$.details.outOfShift").value(false))
                .andExpect(jsonPath("$.details.roleMismatch").value(true))
                .andExpect(jsonPath("$.details.handle").value("Maintenance"));
        change(staff, true).andExpect(status().is4xxClientError());
        assertThat(recorded(p[0], "in_shift AND NOT role_match AND acknowledged")).isEqualTo(1);
    }

    /** TC-AUTH-075: Managers read the record per person and the flagged changes; others' staff 404; Staff 403. */
    @Test
    void managersReadTheRecord() throws Exception {
        String[] p = staff("Recorded Person", "MAINTENANCE");
        String staff = bearer(mvc, p[1]);
        change(staff, true);
        shifts(bearer(mvc, MANAGER_A), p[0], ALWAYS).andExpect(status().isOk());
        change(staff, false);
        String manager = bearer(mvc, MANAGER_A);
        mvc.perform(get("/staff-activity").param("staffId", p[0]).header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.summary.outOfShift").value(1))
                .andExpect(jsonPath("$.items[0].flagged").value(false))
                .andExpect(jsonPath("$.items[1].flagged").value(true))
                .andExpect(jsonPath("$.items[1].staffName").value("Recorded Person"))
                .andExpect(jsonPath("$.items[1].action").value("Maintenance requests · updates"))
                .andExpect(jsonPath("$.items[1].objectId").value("999999"))
                .andExpect(jsonPath("$.staffOptions[*].name", hasItem("Recorded Person")));
        mvc.perform(get("/staff-activity").param("staffId", p[0]).param("flagged", "true")
                .header(HttpHeaders.AUTHORIZATION, manager)).andExpect(jsonPath("$.total").value(1));
        mvc.perform(get("/staff-activity").param("staffId", "1").header(HttpHeaders.AUTHORIZATION, manager))
                .andExpect(status().isNotFound());
        mvc.perform(get("/staff-activity").header(HttpHeaders.AUTHORIZATION, staff)).andExpect(status().isForbidden());
    }

    /** TC-AUTH-500: two shifts of the same day that overlap are refused; back-to-back shifts are kept (BE-AUTH-11). */
    @Test
    void overlappingShiftsAreRefused() throws Exception {
        String[] p = staff("Overlap Person", "MAINTENANCE");
        String manager = bearer(mvc, MANAGER_A);
        shifts(manager, p[0], "{\"shifts\":[{\"weekday\":1,\"start\":\"07:00\",\"end\":\"15:00\"},"
                + "{\"weekday\":1,\"start\":\"08:00\",\"end\":\"12:00\"}]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.shifts").value("Two shifts overlap. Each shift must start after the one before it ends."));
        shifts(manager, p[0], "{\"shifts\":[{\"weekday\":1,\"start\":\"07:00\",\"end\":\"15:00\"},"
                + "{\"weekday\":1,\"start\":\"15:00\",\"end\":\"23:00\"}]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.shifts.length()").value(2));
    }
}
