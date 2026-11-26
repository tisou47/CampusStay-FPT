package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.StayFlow.student;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import vn.fpt.campusstay.service.assignment.RenewalService;
import vn.fpt.campusstay.service.request.EscalationService;

/** Wave 3 business findings on next-Term requests: BE-OPS-21 (temporary Bed), BE-OPS-12, BE-OPS-17. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class Wave3RequestsIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    RenewalService renewals;

    @Autowired
    EscalationService escalations;

    StayFlow stay;
    RenewalFlow renewal;

    @BeforeEach
    void openTerm() {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
        renewal = new RenewalFlow(jdbc, stay);
        renewal.openNextTerm();
        renewal.reset();
    }

    private String roomChange(int n) throws Exception {
        return JsonPath.read(stay.postJson("/room-changes", bearer(mvc, student(n)),
                "{\"kind\":\"same\",\"reason\":\"Health\"}").andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(), "$.id");
    }

    private long notifications(int n) {
        return jdbc.sql("""
                SELECT count(*) FROM ntf_notification x JOIN auth_user u ON u.id = x.user_id WHERE u.email = :e
                """).param("e", student(n)).query(Long.class).single();
    }

    /**
     * TC-REQ-400 (BE-OPS-21): the Manager's temporary Bed on an escalated Room-Change Request really moves the student
     * (current Term) to a free Bed of another Room, tells the student, and leaves the request open.
     */
    @Test
    void temporaryBedReallyMovesTheStudent() throws Exception {
        renewal.resident(3, "A-303", "A", 2);
        renewals.openDue();
        String code = roomChange(3);
        jdbc.sql("""
                UPDATE req_room_change SET submitted_at = now() - interval '80 hours', sla_due_at = now() - interval '8 hours'
                WHERE code = :c
                """).param("c", code).update();
        escalations.scan();
        long before = notifications(3);
        stay.postJson("/escalations/" + code + "/actions", bearer(mvc, MANAGER_A), "{\"action\":\"temporary-bed\"}")
                .andExpect(status().isNoContent());

        record Now(String source, String room) {
        }
        Now now = jdbc.sql("""
                SELECT a.source, r.code FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id
                JOIN inv_bed b ON b.id = a.bed_id JOIN inv_room r ON r.id = b.room_id
                WHERE u.email = :e AND a.term_id = :t AND a.status = 'ACTIVE'
                """).param("e", student(3)).param("t", stay.termId())
                .query((rs, i) -> new Now(rs.getString(1), rs.getString(2))).single();
        assertThat(now.source()).isEqualTo("TEMPORARY");
        assertThat(now.room()).isNotEqualTo("A-303");
        assertThat(jdbc.sql("SELECT status FROM req_room_change WHERE code = :c").param("c", code).query(String.class)
                .single()).isIn("SUBMITTED", "PENDING");
        assertThat(notifications(3)).isGreaterThan(before);
    }

    /** TC-REQ-401 (BE-OPS-12): a room change cannot be approved onto a Bed of the student's own Room. */
    @Test
    void roomChangeRefusesABedInTheSameRoom() throws Exception {
        renewal.resident(5, "A-304", "A", 2);
        renewals.openDue();
        String code = roomChange(5);
        stay.postJson("/room-changes/" + code + "/decision", bearer(mvc, STAFF_A),
                "{\"decision\":\"Approved\",\"bedId\":\"A-304-B\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SAME_ROOM"));
    }

    /** TC-REQ-402 (BE-OPS-17): approving an extension checks the maximum stay length again. */
    @Test
    void extensionApprovalRechecksTheMaximum() throws Exception {
        renewal.resident(6, "A-305", "A", 1);
        renewal.overdueUtility(6, 300_000);
        renewals.openDue();
        String pending = JsonPath.read(stay.postJson("/students/me/stay/extension", bearer(mvc, student(6)),
                "{\"terms\":1}").andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
        String max = jdbc.sql("SELECT value FROM cfg_parameter WHERE key = 'stay.max_terms'").query(String.class).single();
        jdbc.sql("UPDATE cfg_parameter SET value = '1' WHERE key = 'stay.max_terms'").update();
        try {
            stay.postJson("/stay-requests/" + pending + "/decision", bearer(mvc, STAFF_A), "{\"decision\":\"Approved\"}")
                    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("STAY_TOO_LONG"));
        } finally {
            jdbc.sql("UPDATE cfg_parameter SET value = :v WHERE key = 'stay.max_terms'").param("v", max).update();
        }
    }
}
