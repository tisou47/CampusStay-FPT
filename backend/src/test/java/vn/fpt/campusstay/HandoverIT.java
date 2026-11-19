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

/**
 * The check-in inventory (room handover): the four conditions, the door code at the start, the comparison with the
 * Room's record kept from the student, Staff's review and visit, the deadline, and the furniture charges at
 * check-out (TC-ASG-053…059).
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
        mvc.perform(get("/handovers/" + id).header(HttpHeaders.AUTHORIZATION, staff)).andExpect(status().isOk())
                .andExpect(jsonPath("$.row.comparison").value("Major difference"))
                .andExpect(jsonPath("$.electricity.baseline").value(300.0));
        send(post("/handovers/" + id + "/confirm"), staff, "{}").andExpect(status().isBadRequest());
        send(post("/handovers/" + id + "/visit"), staff, "{}").andExpect(status().isOk())
                .andExpect(jsonPath("$.row.status").value("Verifying"));
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
        jdbc.sql("UPDATE asg_allocation SET resident_at = now(), code_released_at = now() WHERE id = :id")
                .param("id", allocation).update();
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
}
