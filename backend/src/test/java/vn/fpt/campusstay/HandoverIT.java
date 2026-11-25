package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.util.List;

import com.jayway.jsonpath.JsonPath;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.service.assignment.HandoverJobService;
import vn.fpt.campusstay.service.billing.FinanceService;

/**
 * The check-in inventory (room handover): the four conditions, the door code at the start, the comparison with the
 * Room's record kept from the student, Staff's review and visit, the deadline, and the furniture charges at
 * check-out (TC-ASG-053…059, 062).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class HandoverIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    HandoverJobService jobs;

    @Autowired
    FinanceService finance;

    StayFlow stay;

    @BeforeEach
    void setUp() {
        long fall = jdbc.sql("SELECT id FROM cfg_term WHERE code = 'FA26'").query(Long.class).single();
        stay = new StayFlow(mvc, jdbc, null, fall);
        jdbc.sql("UPDATE cfg_parameter SET value = 'true' WHERE key = 'handover.required'").update();
    }

    /** The students of this class are reused between tests: their rows and the Rooms' codes go after each test. */
    @AfterEach
    void tearDown() {
        jdbc.sql("UPDATE cfg_parameter SET value = 'false' WHERE key = 'handover.required'").update();
        String mine = """
                (SELECT a.id FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                 WHERE u.email IN ('se190029@student.campusstay.test', 'se190037@student.campusstay.test',
                                   'se190038@student.campusstay.test', 'se190039@student.campusstay.test'))
                """;
        jdbc.sql("DELETE FROM asg_handover WHERE allocation_id IN " + mine).update();
        jdbc.sql("DELETE FROM asg_damage_claim WHERE allocation_id IN " + mine).update();
        jdbc.sql("DELETE FROM asg_check_out_damage WHERE check_out_id IN (SELECT id FROM asg_check_out WHERE allocation_id IN "
                + mine + ")").update();
        jdbc.sql("DELETE FROM asg_check_out WHERE allocation_id IN " + mine).update();
        jdbc.sql("DELETE FROM asg_late_check_in WHERE allocation_id IN " + mine).update();
        jdbc.sql("DELETE FROM bil_meter_cut WHERE room_id IN (SELECT id FROM inv_room WHERE code BETWEEN 'A-201' AND 'A-207')")
                .update();
        jdbc.sql("UPDATE asg_allocation SET stay_id = NULL WHERE id IN " + mine).update();
        jdbc.sql("DELETE FROM asg_allocation WHERE id IN " + mine).update();
        jdbc.sql("""
                DELETE FROM asg_stay WHERE student_id IN (SELECT id FROM auth_user WHERE email IN
                    ('se190029@student.campusstay.test', 'se190037@student.campusstay.test',
                     'se190038@student.campusstay.test', 'se190039@student.campusstay.test'))
                """).update();
        jdbc.sql("DELETE FROM inv_door_code WHERE room_id IN (SELECT id FROM inv_room WHERE code BETWEEN 'A-201' AND 'A-207')")
                .update();
        jdbc.sql("DELETE FROM inv_furniture_item WHERE asset_code = 'DESK-TEST-A206A'").update();
    }

    /** A paid new resident of the Room (not living there yet) whose late arrival is approved until after today. */
    private long newcomer(int n, String room, String bed) {
        stay.livesIn(n, room, bed, false);
        long allocation = jdbc.sql("""
                SELECT a.id FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                WHERE u.email = :e AND a.status = 'ACTIVE' AND a.term_id = :t
                """).param("e", StayFlow.student(n)).param("t", stay.termId()).query(Long.class).single();
        jdbc.sql("""
                INSERT INTO asg_late_check_in (allocation_id, reason, requested_for, window_closed_at, status, deadline,
                                               created_at)
                VALUES (:a, 'Arriving late', current_date, now() - interval '30 days', 'APPROVED', current_date + 2, now())
                """).param("a", allocation).update();
        return allocation;
    }

    private void doorCode(String room) {
        jdbc.sql("""
                INSERT INTO inv_door_code (room_id, code_cipher, status, source, proposed_by, proposed_at, confirmed_by,
                                           confirmed_at)
                SELECT r.id, 'test', 'ACTIVE', 'RANDOM', u.id, now(), u.id, now()
                FROM inv_room r, auth_user u WHERE r.code = :room AND u.email = :staff
                """).param("room", room).param("staff", STAFF_A).update();
    }

    private void meterCut(String room, int electricity, int water) {
        jdbc.sql("""
                INSERT INTO bil_meter_cut (room_id, cut_date, electricity, water, reason)
                SELECT id, current_date - 1, :e, :w, 'TURNOVER' FROM inv_room WHERE code = :room
                """).param("room", room).param("e", electricity).param("w", water).update();
    }

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
            String auth, String body) throws Exception {
        return mvc.perform(request.header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private String json(ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString();
    }

    /** Every item answered with the condition, and the meters. */
    private String answers(String view, String condition, int electricity, int water) {
        List<String> items = JsonPath.read(view, "$.items[*].itemId");
        String list = String.join(",", items.stream()
                .map(id -> "{\"itemId\":\"" + id + "\",\"condition\":\"" + condition + "\"}").toList());
        return "{\"items\":[" + list + "],\"electricity\":" + electricity + ",\"water\":" + water + "}";
    }

    /**
     * TC-ASG-053: without the Room's door code the start is refused and the condition says why; once the code is set
     * the student starts the inventory, receives the code and is a resident, but Utility does not count yet.
     */
    @Test
    void startsOnlyWhenTheFourConditionsHold() throws Exception {
        long allocation = newcomer(37, "A-203", "A");
        String student = bearer(mvc, StayFlow.student(37));

        mvc.perform(get("/students/me/handover").header(HttpHeaders.AUTHORIZATION, student)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Waiting"))
                .andExpect(jsonPath("$.checks[?(@.key == 'doorCode')].passed").value(hasItem(false)));
        send(post("/students/me/handover/start"), student, "").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHECK_IN_NOT_READY"));

        doorCode("A-203");
        mvc.perform(get("/students/me/handover").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.status").value("Ready"));
        send(post("/students/me/handover/start"), student, "").andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(Matchers.startsWith("HO-")));

        record Row(boolean released, boolean resident, boolean counted) {
        }
        Row row = jdbc.sql("""
                SELECT code_released_at IS NOT NULL AS released, resident_at IS NOT NULL AS resident,
                       utility_from IS NOT NULL AS counted
                FROM asg_allocation WHERE id = :id
                """).param("id", allocation)
                .query((rs, i) -> new Row(rs.getBoolean(1), rs.getBoolean(2), rs.getBoolean(3))).single();
        assertThat(row.released()).isTrue();
        assertThat(row.resident()).isTrue();
        assertThat(row.counted()).isFalse();
        send(post("/students/me/handover/start"), student, "").andExpect(status().isConflict());
    }

    /**
     * TC-ASG-060: while the check-in inventory is on, the desk does not check in a new resident who has not filed it;
     * once the inventory is final the student is checked in by it.
     */
    @Test
    void deskWaitsForTheCheckInInventory() throws Exception {
        newcomer(29, "A-203", "A");
        String staff = bearer(mvc, STAFF_A);
        String body = "{\"studentCode\":\"se190029\",\"items\":[]}";
        send(post("/check-in"), staff, body).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHECK_IN_BLOCKED"))
                .andExpect(jsonPath("$.message").value(Matchers.containsString("Check-in inventory")));

        doorCode("A-203");
        meterCut("A-203", 300, 30);
        String student = bearer(mvc, StayFlow.student(29));
        send(post("/students/me/handover/start"), student, "").andExpect(status().isOk());
        send(post("/check-in"), staff, body).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHECK_IN_BLOCKED"));
        String view = json(mvc.perform(get("/students/me/handover").header(HttpHeaders.AUTHORIZATION, student)));
        send(post("/students/me/handover/submit"), student, answers(view, "Good", 300, 30))
                .andExpect(jsonPath("$.status").value("Final"));
        send(post("/check-in"), staff, body).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_CHECKED_IN"));
    }

    /**
     * TC-ASG-054: the student's view never carries the Room's record nor the comparison, and the Staff endpoints are
     * closed to students.
     */
    @Test
    void studentNeverSeesTheRoomsRecord() throws Exception {
        newcomer(38, "A-204", "A");
        doorCode("A-204");
        meterCut("A-204", 100, 10);
        String student = bearer(mvc, StayFlow.student(38));
        String id = JsonPath.read(json(send(post("/students/me/handover/start"), student, "")), "$.id");

        mvc.perform(get("/students/me/handover").header(HttpHeaders.AUTHORIZATION, student)).andExpect(status().isOk())
                .andExpect(content().string(not(Matchers.containsString("baseline"))))
                .andExpect(content().string(not(Matchers.containsString("comparison"))));
        mvc.perform(get("/handovers/" + id).header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isForbidden());
        mvc.perform(get("/handovers").header(HttpHeaders.AUTHORIZATION, student)).andExpect(status().isForbidden());
    }

    /**
     * TC-ASG-055: an inventory that matches the Room's record is final at once: Utility counts from the student's
     * reading and the desk check-in is recorded; a reading lower than the Room's is refused.
     */
    @Test
    void matchingInventoryIsFinalAtOnce() throws Exception {
        long allocation = newcomer(39, "A-202", "A");
        doorCode("A-202");
        meterCut("A-202", 200, 20);
        String student = bearer(mvc, StayFlow.student(39));
        send(post("/students/me/handover/start"), student, "").andExpect(status().isOk());
        String view = json(mvc.perform(get("/students/me/handover").header(HttpHeaders.AUTHORIZATION, student)));

        send(post("/students/me/handover/submit"), student, answers(view, "Good", 150, 20))
                .andExpect(status().isBadRequest());
        send(post("/students/me/handover/submit"), student, answers(view, "Good", 201, 20))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("Final"))
                .andExpect(jsonPath("$.source").value("As you filed it"));

        assertThat(jdbc.sql("""
                SELECT utility_from IS NOT NULL AND checked_in_at IS NOT NULL FROM asg_allocation WHERE id = :id
                """).param("id", allocation).query(Boolean.class).single()).isTrue();
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_meter_cut WHERE allocation_id = :id AND reason = 'CHECK_IN'
                """).param("id", allocation).query(Long.class).single()).isEqualTo(1);
    }

    /**
     * TC-ASG-063: Report 1 (Staff's inspection before arrival) bounds the student's meters even when Billing's latest
     * reading is lower: a reading below it is refused, one far above the accepted use is refused as a typo, and one
     * within the misreading allowance matches.
     */
    @Test
    void readingsAreBoundedByReportOne() throws Exception {
        newcomer(29, "A-205", "A");
        doorCode("A-205");
        meterCut("A-205", 100, 10);
        String student = bearer(mvc, StayFlow.student(29));
        String id = JsonPath.read(json(send(post("/students/me/handover/start"), student, "")), "$.id");
        // Report 1: Staff read 1703 kWh and 45 m³ before the student arrived.
        jdbc.sql("UPDATE asg_handover SET baseline_electricity = 1703, baseline_water = 45 WHERE id = :id")
                .param("id", Long.parseLong(id.replace("HO-", ""))).update();
        String view = json(mvc.perform(get("/students/me/handover").header(HttpHeaders.AUTHORIZATION, student)));

        send(post("/students/me/handover/submit"), student, answers(view, "Good", 1450, 45))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.electricity").isString());
        send(post("/students/me/handover/submit"), student, answers(view, "Good", 1703, 40))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.water").isString());
        send(post("/students/me/handover/submit"), student, answers(view, "Good", 9000, 45))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.electricity").isString());
        send(post("/students/me/handover/submit"), student, answers(view, "Good", 1703, 45))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("Final"));
    }

    /**
     * TC-ASG-061: with the student in the Room, Staff sign the Final report there: the inventory is final at once
     * (no agreement on the app), the student is checked in, and check-out compares with that Final report.
     */
    @Test
    void finalReportSignedInTheRoom() throws Exception {
        long allocation = newcomer(38, "A-206", "A");
        doorCode("A-206");
        meterCut("A-206", 500, 50);
        String student = bearer(mvc, StayFlow.student(38));
        String id = JsonPath.read(json(send(post("/students/me/handover/start"), student, "")), "$.id");
        String view = json(mvc.perform(get("/students/me/handover").header(HttpHeaders.AUTHORIZATION, student)));
        send(post("/students/me/handover/submit"), student, answers(view, "Good", 600, 50))
                .andExpect(jsonPath("$.status").value("Submitted"));

        String staff = bearer(mvc, STAFF_A);
        String detail = json(mvc.perform(get("/handovers/" + id).header(HttpHeaders.AUTHORIZATION, staff)));
        String slot = JsonPath.read(detail, "$.visitWindow.suggestions[0]");
        send(post("/handovers/" + id + "/visit"), staff, "{\"visitAt\":\"" + slot + "\"}").andExpect(status().isOk());
        send(put("/handovers/" + id + "/verification"), staff,
                "{\"electricity\":501,\"water\":50,\"finalizeOnSite\":true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.row.status").value("Final"))
                .andExpect(jsonPath("$.source").value("Checked in the Room"))
                .andExpect(jsonPath("$.electricity.verified").value(501.0));

        mvc.perform(get("/students/me/handover").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.status").value("Final")).andExpect(jsonPath("$.toAgree").value(false));
        send(post("/students/me/handover/agree"), student, "{}").andExpect(status().isConflict());
        assertThat(jdbc.sql("SELECT checked_in_at IS NOT NULL FROM asg_allocation WHERE id = :id")
                .param("id", allocation).query(Boolean.class).single()).isTrue();
        mvc.perform(get("/check-outs/" + allocation + "/furniture").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checkInReport.id").value(id))
                .andExpect(jsonPath("$.checkInReport.source").value("Checked in the Room"));
        // The check-out desk's detail carries the Final report (it failed with a 500 on its item query).
        mvc.perform(get("/check-out/" + allocation).header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handoverReport.id").value(id))
                .andExpect(jsonPath("$.handoverReport.electricity").value(501.0))
                .andExpect(jsonPath("$.handoverReport.items").isNotEmpty());
    }

    /**
     * TC-ASG-056: a meter far above the Room's record is a major difference: Staff ask for a visit, record what they
     * find and send it; the student agrees with a comment and the inventory is final (no dispute state).
     */
    @Test
    void majorDifferenceIsCheckedInTheRoom() throws Exception {
        newcomer(29, "A-201", "A");
        doorCode("A-201");
        meterCut("A-201", 300, 30);
        String student = bearer(mvc, StayFlow.student(29));
        String id = JsonPath.read(json(send(post("/students/me/handover/start"), student, "")), "$.id");
        String view = json(mvc.perform(get("/students/me/handover").header(HttpHeaders.AUTHORIZATION, student)));
        send(post("/students/me/handover/submit"), student, answers(view, "Good", 360, 30))
                .andExpect(jsonPath("$.status").value("Submitted"));

        String staff = bearer(mvc, STAFF_A);
        String detail = json(mvc.perform(get("/handovers/" + id).header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.row.comparison").value("Major difference"))
                .andExpect(jsonPath("$.electricity.baseline").value(300.0))
                .andExpect(jsonPath("$.visitWindow.fromHour").value(8))
                .andExpect(jsonPath("$.visitWindow.toHour").value(17)));
        // A major difference is never confirmed from the desk, even with a reason: Staff check the Room.
        send(post("/handovers/" + id + "/confirm"), staff, "{\"reason\":\"Looks fine\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MAJOR_NEEDS_VISIT"));
        send(post("/handovers/" + id + "/visit"), staff, "{}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.visitAt").isString());
        send(post("/handovers/" + id + "/visit"), staff, "{\"visitAt\":\"2020-01-01T03:00:00Z\"}")
                .andExpect(status().isBadRequest());
        String slot = JsonPath.read(detail, "$.visitWindow.suggestions[0]");
        send(post("/handovers/" + id + "/visit"), staff, "{\"visitAt\":\"" + slot + "\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.row.status").value("Verifying"))
                // Nothing is shown for Staff before they record what they find in the Room.
                .andExpect(jsonPath("$.electricity.verified").value((Object) null))
                .andExpect(jsonPath("$.items[0].verified").value((Object) null));
        send(put("/handovers/" + id + "/verification"), staff, "{\"electricity\":301,\"water\":30,\"send\":true}")
                .andExpect(status().isOk());

        mvc.perform(get("/students/me/handover").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.toAgree").value(true)).andExpect(jsonPath("$.staffElectricity").value(301.0));
        send(post("/students/me/handover/agree"), student, "{\"comment\":\"The meter showed 360 this morning.\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("Final"))
                .andExpect(jsonPath("$.source").value("Checked with Staff"));
    }

    /** TC-ASG-057: a draft past its deadline becomes final with the Room's record; Utility counts from the code. */
    @Test
    void deadlineClosesTheInventory() throws Exception {
        long allocation = newcomer(37, "A-205", "B");
        doorCode("A-205");
        String student = bearer(mvc, StayFlow.student(37));
        send(post("/students/me/handover/start"), student, "").andExpect(status().isOk());
        jdbc.sql("UPDATE asg_handover SET due_at = now() - interval '1 minute' WHERE allocation_id = :a")
                .param("a", allocation).update();

        assertThat(jobs.closeDue()).isEqualTo(1);
        mvc.perform(get("/students/me/handover").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.status").value("Final")).andExpect(jsonPath("$.source").value("Deadline passed"))
                .andExpect(jsonPath("$.lateAllowed").value(true));
        assertThat(jdbc.sql("SELECT utility_from = code_released_at FROM asg_allocation WHERE id = :id")
                .param("id", allocation).query(Boolean.class).single()).isTrue();
        send(post("/students/me/handover/late"), student, "{\"note\":\"The fan was already broken.\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.lateAllowed").value(false));
    }

    /**
     * TC-ASG-058: at check-out a personal item Good at check-in and Damaged now costs its price × the share the
     * Mostly damaged level loses (50 %); the check-out waits for the student's agreement on the app.
     */
    @Test
    void personalItemIsChargedByCondition() throws Exception {
        long allocation = newcomer(38, "A-206", "A");
        // Checked in (a check-out needs it since the check-out guard): resident with the code, at the desk.
        jdbc.sql("""
                UPDATE asg_allocation SET resident_at = now(), code_released_at = now(), checked_in_at = now()
                WHERE id = :id
                """).param("id", allocation).update();
        jdbc.sql("""
                INSERT INTO inv_furniture_item (asset_code, furniture_type_id, status, room_id, bed_id)
                SELECT 'DESK-TEST-A206A', t.id, 'IN_USE', r.id, b.id
                FROM inv_furniture_type t, inv_room r JOIN inv_bed b ON b.room_id = r.id AND b.label = 'A'
                WHERE t.code = 'DESK' AND r.code = 'A-206'
                """).update();
        long price = jdbc.sql("""
                SELECT unit_price FROM inv_furniture_type WHERE code = 'DESK'
                """).query(Long.class).single();
        String staff = bearer(mvc, STAFF_A);
        String itemId = jdbc.sql("SELECT 'furniture-' || id FROM inv_furniture_item WHERE asset_code = 'DESK-TEST-A206A'")
                .query(String.class).single();

        send(put("/check-outs/" + allocation + "/furniture"), staff,
                "{\"items\":[{\"itemId\":\"" + itemId + "\",\"condition\":\"Damaged\"}],\"studentPresent\":true}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(price / 2));
        send(post("/check-out/" + allocation), staff,
                "{\"electricity\":10,\"water\":1,\"conditionGood\":false,\"keyReturned\":true,\"draft\":false}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STUDENT_NOT_AGREED"));

        String student = bearer(mvc, StayFlow.student(38));
        send(post("/students/me/check-out/agree"), student, "").andExpect(status().isOk())
                .andExpect(jsonPath("$.agreedAt").isNotEmpty()).andExpect(jsonPath("$.total").value(price / 2));
    }

    /**
     * TC-ASG-077: a student who does not agree with the charges says which items and why; they cannot agree until the
     * Staff member checks again and answers (a reason is required on both sides); then they agree.
     */
    @Test
    void aStudentDisputesTheChargesAndStaffAnswer() throws Exception {
        long allocation = newcomer(38, "A-209", "A");
        jdbc.sql("""
                UPDATE asg_allocation SET resident_at = now(), code_released_at = now(), checked_in_at = now()
                WHERE id = :id
                """).param("id", allocation).update();
        jdbc.sql("""
                INSERT INTO inv_furniture_item (asset_code, furniture_type_id, status, room_id, bed_id)
                SELECT 'DESK-TEST-A209A', t.id, 'IN_USE', r.id, b.id
                FROM inv_furniture_type t, inv_room r JOIN inv_bed b ON b.room_id = r.id AND b.label = 'A'
                WHERE t.code = 'DESK' AND r.code = 'A-209'
                """).update();
        String itemId = jdbc.sql("SELECT 'furniture-' || id FROM inv_furniture_item WHERE asset_code = 'DESK-TEST-A209A'")
                .query(String.class).single();
        String staff = bearer(mvc, STAFF_A);
        String student = bearer(mvc, StayFlow.student(38));
        send(put("/check-outs/" + allocation + "/furniture"), staff,
                "{\"items\":[{\"itemId\":\"" + itemId + "\",\"condition\":\"Damaged\"}],\"studentPresent\":true}")
                .andExpect(status().isOk());

        send(post("/students/me/check-out/dispute"), student, "{\"itemIds\":[\"" + itemId + "\"],\"reason\":\" \"}")
                .andExpect(status().isBadRequest());
        send(post("/students/me/check-out/dispute"), student,
                "{\"itemIds\":[\"" + itemId + "\"],\"reason\":\"The desk was scratched at check-in.\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.dispute.status").value("Open"))
                .andExpect(jsonPath("$.dispute.itemIds[0]").value(itemId));
        send(post("/students/me/check-out/agree"), student, "").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DISPUTE_OPEN"));
        mvc.perform(get("/check-outs/" + allocation + "/furniture").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isOk()).andExpect(jsonPath("$.dispute.reason").value("The desk was scratched at check-in."));

        // Staff check again: the desk was only worn; they record it and answer.
        send(put("/check-outs/" + allocation + "/furniture"), staff,
                "{\"items\":[{\"itemId\":\"" + itemId + "\",\"condition\":\"Worn\"}],\"studentPresent\":true}")
                .andExpect(status().isOk());
        send(post("/check-outs/" + allocation + "/dispute/answer"), staff, "{\"answer\":\"\"}")
                .andExpect(status().isBadRequest());
        send(post("/check-outs/" + allocation + "/dispute/answer"), staff, "{\"answer\":\"Only worn: charged as Worn.\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.dispute.status").value("Answered"));
        send(post("/check-outs/" + allocation + "/dispute/answer"), staff, "{\"answer\":\"Again\"}")
                .andExpect(status().isConflict());
        send(post("/students/me/check-out/agree"), student, "").andExpect(status().isOk())
                .andExpect(jsonPath("$.agreedAt").isNotEmpty());
    }

    /**
     * TC-ASG-059: damage to a shared item is charged only once the student acknowledges it; a declined one is not.
     */
    @Test
    void sharedDamageNeedsTheStudentsAcknowledgement() throws Exception {
        long allocation = newcomer(39, "A-207", "A");
        jdbc.sql("UPDATE asg_allocation SET resident_at = now(), code_released_at = now() WHERE id = :id")
                .param("id", allocation).update();
        List<String> shared = jdbc.sql("""
                SELECT 'furniture-' || i.id FROM inv_furniture_item i JOIN inv_room r ON r.id = i.room_id
                WHERE r.code = 'A-207' AND i.bed_id IS NULL ORDER BY i.id
                """).query(String.class).list();
        assertThat(shared).isNotEmpty();
        String staff = bearer(mvc, STAFF_A);
        String claim = JsonPath.read(json(send(post("/check-outs/" + allocation + "/damage-claims"), staff,
                "{\"itemId\":\"" + shared.getFirst() + "\",\"condition\":\"Damaged\"}").andExpect(status().isOk())),
                "$.id");
        String student = bearer(mvc, StayFlow.student(39));

        String declined = json(send(post("/students/me/damage-claims/" + claim), student, "{\"acknowledge\":false}")
                .andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(declined, "$.total")).isZero();

        String again = JsonPath.read(json(send(post("/check-outs/" + allocation + "/damage-claims"), staff,
                "{\"itemId\":\"" + shared.getFirst() + "\",\"condition\":\"Damaged\"}")), "$.id");
        send(post("/students/me/damage-claims/" + again), student, "{\"acknowledge\":true}").andExpect(status().isOk())
                .andExpect(jsonPath("$.claims[?(@.id == '" + again + "')].status").value(hasItem("Acknowledged")));
        mvc.perform(get("/check-outs/" + allocation + "/furniture").header(HttpHeaders.AUTHORIZATION, bearer(mvc,
                MANAGER_A))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(Matchers.greaterThan(0)));
    }

    /**
     * TC-ASG-062: damage Staff record on a shared item at a check-out is split evenly among the Room's residents: the
     * leaver's line carries their share (with the rounding remainder), and when the check-out is completed each
     * roommate gets a DAMAGE Invoice for theirs, which becomes Overdue like any charge when it is not paid in time.
     */
    @Test
    void sharedDamageIsSplitAmongTheResidents() throws Exception {
        List<String> beds = jdbc.sql("""
                SELECT b.label FROM inv_bed b JOIN inv_room r ON r.id = b.room_id WHERE r.code = 'A-208' ORDER BY b.label
                """).query(String.class).list();
        assertThat(beds).hasSizeGreaterThanOrEqualTo(2);
        stay.livesIn(40, "A-208", beds.get(0), true);
        stay.livesIn(41, "A-208", beds.get(1), true);
        long leaver = jdbc.sql("""
                SELECT a.id FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                WHERE u.email = :e AND a.status = 'ACTIVE' AND a.term_id = :t
                """).param("e", StayFlow.student(40)).param("t", stay.termId()).query(Long.class).single();
        long roommate = jdbc.sql("""
                SELECT a.id FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                WHERE u.email = :e AND a.status = 'ACTIVE' AND a.term_id = :t
                """).param("e", StayFlow.student(41)).param("t", stay.termId()).query(Long.class).single();
        record Shared(String id, long price) {
        }
        Shared item = jdbc.sql("""
                SELECT 'furniture-' || i.id AS id, t.unit_price FROM inv_furniture_item i
                JOIN inv_room r ON r.id = i.room_id JOIN inv_furniture_type t ON t.id = i.furniture_type_id
                WHERE r.code = 'A-208' AND i.bed_id IS NULL AND t.unit_price > 0 ORDER BY i.id LIMIT 1
                """).query((rs, i) -> new Shared(rs.getString("id"), rs.getLong("unit_price"))).single();
        String staff = bearer(mvc, STAFF_A);

        String view = json(send(put("/check-outs/" + leaver + "/furniture"), staff,
                "{\"items\":[{\"itemId\":\"" + item.id() + "\",\"condition\":\"Damaged\"}],\"studentPresent\":false}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.itemId == '" + item.id() + "')].sharedWith").value(hasItem(2))));
        List<Integer> percents = JsonPath.read(view, "$.items[?(@.itemId == '" + item.id() + "')].percent");
        List<Number> fulls = JsonPath.read(view, "$.items[?(@.itemId == '" + item.id() + "')].fullAmount");
        long full = item.price() * percents.getFirst() / 100;
        assertThat(full).isPositive();
        assertThat(fulls.getFirst().longValue()).isEqualTo(full);
        assertThat(((Number) JsonPath.read(view, "$.total")).longValue()).isEqualTo(full - full / 2);
        send(post("/check-out/" + leaver), staff,
                "{\"electricity\":10,\"water\":1,\"conditionGood\":false,\"draft\":false}")
                .andExpect(status().isOk());

        String reference = "SHARED-" + leaver + "-" + item.id().substring("furniture-".length()) + "-" + roommate;
        record Issued(String type, long amount, String status) {
        }
        Issued invoice = jdbc.sql("SELECT type, amount, status FROM bil_invoice WHERE reference = :r")
                .param("r", reference).query((rs, i) -> new Issued(rs.getString("type"), rs.getLong("amount"),
                        rs.getString("status"))).single();
        assertThat(invoice).isEqualTo(new Issued("DAMAGE", full / 2, "UNPAID"));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, bearer(mvc, StayFlow.student(41))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isNotEmpty());

        jdbc.sql("UPDATE bil_invoice SET due_at = now() - interval '1 day' WHERE reference = :r").param("r", reference)
                .update();
        finance.markOverdue();
        assertThat(jdbc.sql("SELECT status FROM bil_invoice WHERE reference = :r").param("r", reference)
                .query(String.class).single()).isEqualTo("OVERDUE");
    }
}
