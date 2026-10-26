package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.time.LocalDate;

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

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.service.assignment.TerminationService;

/**
 * Terminations of stays (spec §6.15, D-27): started by a Manager (or the Utility debt rule), cancelled only by a
 * Manager with a reason, Overdue after the move-out date with the door code rotated, closed by the check-out with the
 * unused room fee refunded by its rule (TC-ASG-035, 036).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class TerminationIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    TerminationService terminations;

    StayFlow stay;

    @BeforeEach
    void setUp() {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
    }

    private ResultActions postJson(String path, String auth, String body) throws Exception {
        return mvc.perform(post(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private String allocationOf(int n) {
        return jdbc.sql("""
                SELECT a.id::text FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                WHERE u.email = :e AND a.status = 'ACTIVE'
                """).param("e", StayFlow.student(n)).query(String.class).single();
    }

    /**
     * TC-ASG-035: a Manager terminates a resident's stay with a reason: Notice sent with the move-out date, the
     * student is told (in-app and email) and sees it on My Room, the desk lists the check-out; Staff read it but may
     * not start or cancel; one termination at a time; a Manager cancels it with a reason and the student is told.
     */
    @Test
    void managerTerminatesAndCancels() throws Exception {
        stay.livesIn(11, "A-109", "A", true);
        String manager = bearer(mvc, MANAGER_A);
        String staff = bearer(mvc, STAFF_A);
        postJson("/terminations", manager, "{\"studentCode\":\"SE190011\",\"reason\":\"Manager decision\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.note").isString());
        postJson("/terminations", staff, "{\"studentCode\":\"SE190011\",\"reason\":\"Manager decision\",\"note\":\"x\"}")
                .andExpect(status().isForbidden());
        postJson("/terminations", manager, "{\"studentCode\":\"SE190012\",\"reason\":\"Not enrolled\"}")
                .andExpect(status().isNotFound());
        String id = com.jayway.jsonpath.JsonPath.read(postJson("/terminations", manager,
                "{\"studentCode\":\"SE190011\",\"reason\":\"Manager decision\",\"note\":\"Repeated noise after midnight.\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.moveOutBy").value(LocalDate.now(TimeConfig.CAMPUS_ZONE).plusDays(3).toString()))
                .andReturn().getResponse().getContentAsString(), "$.id");
        postJson("/terminations", manager, "{\"studentCode\":\"SE190011\",\"reason\":\"Not enrolled\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_TERMINATED"));

        getAs("/terminations?status=Notice sent", staff)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].studentCode").value("SE190011"))
                .andExpect(jsonPath("$.items[0].reason").value("Manager decision"))
                .andExpect(jsonPath("$.items[0].status").value("Notice sent"))
                .andExpect(jsonPath("$.counts.noticeSent").value(1));
        getAs("/terminations", bearer(mvc, TestAuth.STAFF_B2)).andExpect(jsonPath("$.total").value(0));
        String student = bearer(mvc, StayFlow.student(11));
        getAs("/terminations", student).andExpect(status().isForbidden());
        getAs("/students/me/allocation", student)
                .andExpect(jsonPath("$.termination.reason").value("Manager decision"))
                .andExpect(jsonPath("$.termination.note").value("Repeated noise after midnight."))
                .andExpect(jsonPath("$.termination.status").value("Notice sent"));
        getAs("/notifications", student).andExpect(jsonPath("$.items[*].title",
                hasItem("Your stay is terminated · Room A-109")));
        assertThat(jdbc.sql("SELECT count(*) FROM ntf_email_outbox WHERE to_email = :e")
                .param("e", StayFlow.student(11)).query(Long.class).single()).isEqualTo(1);
        getAs("/check-out?termId=" + stay.termId() + "&q=SE190011", staff)
                .andExpect(jsonPath("$.items[0].reason").value("Termination"));

        postJson("/terminations/" + id + "/cancel", staff, "{\"reason\":\"Mistake\"}").andExpect(status().isForbidden());
        postJson("/terminations/" + id + "/cancel", manager, "{\"reason\":\" \"}").andExpect(status().isBadRequest());
        postJson("/terminations/" + id + "/cancel", bearer(mvc, MANAGER_B), "{\"reason\":\"The noise came from another Room.\"}")
                .andExpect(status().isNoContent());
        postJson("/terminations/" + id + "/cancel", manager, "{\"reason\":\"Again\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TERMINATION_CLOSED"));
        getAs("/students/me/allocation", student).andExpect(jsonPath("$.termination").value((Object) null));
        getAs("/notifications", student).andExpect(jsonPath("$.items[*].title",
                hasItem("Termination cancelled · Room A-109")));
        getAs("/check-out?termId=" + stay.termId() + "&q=SE190011", staff)
                .andExpect(jsonPath("$.items[0].reason").value("End of Term"));
    }

    /**
     * TC-ASG-036: past the move-out date the termination is Overdue: Managers and the Block's Staff are told, the
     * Room's door code must change and the student no longer sees it; the check-out closes the termination and refunds
     * the unused room fee by its rule (Not enrolled 30 %, decided by a Manager).
     */
    @Test
    void overdueThenCheckedOut() throws Exception {
        stay.livesIn(13, "A-108", "A", true);
        String allocation = allocationOf(13);
        jdbc.sql("""
                INSERT INTO bil_invoice (code, term_id, student_id, allocation_id, building_id, type, title, amount,
                                         utility_deposit, status, transfer_content, due_at, paid_at, payment_method,
                                         student_name, student_code, gender)
                SELECT 'INV-TT31-B13', a.term_id, a.student_id, a.id, r.building_id, 'BALANCE', 'Balance', 8000000, 600000,
                       'PAID', 'CSTAYB13', now(), now(), 'TRANSFER', u.display_name, s.student_code, s.gender
                FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id JOIN auth_student s ON s.user_id = u.id
                JOIN inv_bed b ON b.id = a.bed_id JOIN inv_room r ON r.id = b.room_id WHERE a.id = CAST(:a AS BIGINT)
                """).param("a", allocation).update();
        String staff = bearer(mvc, STAFF_A);
        mvc.perform(post("/door-codes/A-108").header(HttpHeaders.AUTHORIZATION, staff)
                .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"112233\"}")).andExpect(status().isOk());
        mvc.perform(post("/door-codes/A-108/confirm").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isNoContent());
        String student = bearer(mvc, StayFlow.student(13));
        getAs("/students/me/door-code", student).andExpect(jsonPath("$.status").value("Ready"));

        String manager = bearer(mvc, MANAGER_A);
        String id = com.jayway.jsonpath.JsonPath.read(postJson("/terminations", manager,
                "{\"studentCode\":\"SE190013\",\"reason\":\"Not enrolled\"}").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.id");
        assertThat(terminations.markOverdue()).isZero();
        jdbc.sql("UPDATE asg_termination SET move_out_by = current_date - 1 WHERE id = CAST(:id AS BIGINT)")
                .param("id", id).update();
        assertThat(terminations.markOverdue()).isEqualTo(1);
        assertThat(terminations.markOverdue()).isZero();
        getAs("/terminations?status=Overdue", manager).andExpect(jsonPath("$.items[0].studentCode").value("SE190013"));
        getAs("/notifications", manager).andExpect(jsonPath("$.items[*].title", hasItem("Overdue check-out · Room A-108")));
        getAs("/notifications", staff).andExpect(jsonPath("$.items[*].title", hasItem("Overdue check-out · Room A-108")));
        getAs("/door-codes?q=A-108", staff)
                .andExpect(jsonPath("$.items[0].status").value("Change needed"))
                .andExpect(jsonPath("$.items[0].task.reason").value("Termination overdue"));
        getAs("/students/me/door-code", student)
                .andExpect(jsonPath("$.status").value("Not ready"))
                .andExpect(jsonPath("$.note").value("Your stay is terminated and its move-out date has passed."));

        postJson("/check-out/" + allocation, staff, "{\"electricity\":10,\"water\":1,\"conditionGood\":true,\"keyReturned\":true}")
                .andExpect(status().isOk());
        getAs("/terminations?status=Checked out", manager).andExpect(jsonPath("$.items[0].studentCode").value("SE190013"));
        // Room fee paid 7,400,000 (the Utility Deposit apart), the whole stay unused (before it started): 30 %.
        assertThat(jdbc.sql("""
                SELECT amount FROM bil_refund WHERE source_type = 'TERMINATION' AND status = 'PENDING' AND paid_amount = 7400000
                """).query(Long.class).list()).containsExactly(2_220_000L);
    }
}
