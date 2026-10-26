package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.StayFlow.student;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.nio.charset.StandardCharsets;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.service.assignment.RenewalService;

/**
 * Enrollment reconciliation (spec §6.12, D-28): the enrolled list or a leavers list of a Term against its residents,
 * continuing residents and applicants, in four groups; each item of groups 1–2 is resolved with a note, "Not
 * enrolled" ending what the student holds in the Term; the next-Term fees wait for it (TC-AUTH-053…055).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ReconciliationIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    RenewalService renewals;

    ApplyFlow flow;
    StayFlow stay;
    RenewalFlow renewal;
    long next;

    @BeforeEach
    void openTerm() {
        flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
        renewal = new RenewalFlow(jdbc, stay);
        next = renewal.openNextTerm();
        renewal.reset();
    }

    private ResultActions upload(String auth, long termId, String kind, String csv) throws Exception {
        return mvc.perform(multipart("/reconciliations").file(new MockMultipartFile("file", "list.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8))).param("termId", String.valueOf(termId)).param("kind", kind)
                .header(HttpHeaders.AUTHORIZATION, auth));
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private String item(String detail, int group, String code) {
        return JsonPath.<java.util.List<String>>read(detail,
                "$.items[?(@.group == %d && @.studentCode == '%s')].id".formatted(group, code)).getFirst();
    }

    /**
     * TC-AUTH-053: the enrolled list of the next Term: a continuing resident who graduated (group 1, the directory
     * updated: group 4), a continuing resident missing from the list (group 2), an unknown code (group 3), another
     * student's changed status (group 4); the template; Managers upload, the Admin reads, Staff may not; a file
     * without a student code column is refused.
     */
    @Test
    void enrolledListGroups() throws Exception {
        renewal.resident(1, "A-101", "A", 2);
        renewal.resident(2, "A-101", "B", 2);
        renewal.resident(3, "A-102", "A", 2);
        renewals.openDue();
        String manager = bearer(mvc, MANAGER_A);
        getAs("/reconciliations/template?kind=enrolled", manager)
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("student_code,full_name,enrollment_status")));
        upload(manager, next, "enrolled", "name\nNguyen Van A\n")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.file").isString());
        upload(bearer(mvc, STAFF_A), next, "enrolled", "student_code\nSE190001\n").andExpect(status().isForbidden());
        upload(bearer(mvc, ADMIN), next, "enrolled", "student_code\nSE190001\n").andExpect(status().isForbidden());

        String detail = upload(manager, next, "enrolled", """
                student_code,full_name,enrollment_status
                SE190001,,Enrolled
                SE190002,,Graduated
                SE199999,Nobody,Enrolled
                SE190005,,Bảo lưu
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.run.kind").value("Enrolled list"))
                .andExpect(jsonPath("$.run.rowsRead").value(4))
                .andExpect(jsonPath("$.run.counts.notEnrolled").value(1))
                .andExpect(jsonPath("$.run.counts.notFound").value(1))
                .andExpect(jsonPath("$.run.counts.unknownCodes").value(1))
                .andExpect(jsonPath("$.run.counts.changed").value(2))
                .andExpect(jsonPath("$.run.counts.open").value(2))
                .andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<java.util.List<String>>read(detail,
                "$.items[?(@.group == 1)].roles[0]")).containsExactly("Continuing resident");
        assertThat(JsonPath.<java.util.List<String>>read(detail, "$.items[?(@.group == 2)].studentCode"))
                .containsExactly("SE190003");
        assertThat(JsonPath.<java.util.List<String>>read(detail, "$.items[?(@.group == 4)].fileStatus"))
                .contains("Graduated", "Suspended");
        assertThat(jdbc.sql("SELECT enrollment_status FROM auth_student WHERE student_code = 'SE190005'")
                .query(String.class).single()).isEqualTo("SUSPENDED");
        getAs("/reconciliations?termId=" + next, bearer(mvc, ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.runs[0].counts.open").value(2))
                .andExpect(jsonPath("$.openItems").value(2))
                .andExpect(jsonPath("$.resolved").value(false));
        getAs("/reconciliations?termId=" + next, bearer(mvc, STAFF_A)).andExpect(status().isForbidden());
    }

    /**
     * TC-AUTH-054: resolving: a note is required; "Not enrolled" releases the student's Bed for the next Term (told in
     * the app); "Enrolled" keeps everything; an item is resolved once; then nothing blocks the next-Term fees.
     */
    @Test
    void resolveItems() throws Exception {
        renewal.resident(4, "A-103", "A", 2);
        renewal.resident(6, "A-103", "B", 2);
        renewals.openDue();
        String manager = bearer(mvc, MANAGER_A);
        String detail = upload(manager, next, "enrolled", "student_code,enrollment_status\nSE190004,Withdrawn\n")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String run = JsonPath.read(detail, "$.run.id");
        String notEnrolled = item(detail, 1, "SE190004");
        String missing = item(detail, 2, "SE190006");
        String path = "/reconciliations/" + run + "/items/";
        stay.postJson(path + notEnrolled + "/resolve", manager, "{\"outcome\":\"Not enrolled\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.note").isString());
        stay.postJson(path + notEnrolled + "/resolve", manager,
                "{\"outcome\":\"Not enrolled\",\"note\":\"Withdrew in October.\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Resolved"))
                .andExpect(jsonPath("$.outcome").value("Not enrolled"));
        stay.postJson(path + notEnrolled + "/resolve", manager, "{\"outcome\":\"Enrolled\",\"note\":\"x\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_RESOLVED"));
        getAs("/students/me/allocation", bearer(mvc, student(4)))
                .andExpect(jsonPath("$.nextTerm.state").value("Not continuing"))
                .andExpect(jsonPath("$.nextTerm.endReason").value("Not enrolled"));
        getAs("/notifications", bearer(mvc, student(4))).andExpect(jsonPath("$.items[*].title",
                hasItem("No Bed for " + RenewalFlow.NEXT_NAME)));

        stay.postJson(path + missing + "/resolve", manager,
                "{\"outcome\":\"Enrolled\",\"note\":\"Checked with the academic office.\"}")
                .andExpect(status().isOk());
        getAs("/students/me/allocation", bearer(mvc, student(6))).andExpect(jsonPath("$.nextTerm.state").value("Continuing"));
        getAs("/reconciliations?termId=" + next, manager).andExpect(jsonPath("$.resolved").value(true));
        renewal.milestone("requests_close_at", "-1 minute");
        renewals.closeDue();
        getAs("/next-term-fees?termId=" + next, manager).andExpect(jsonPath("$.blockers").isEmpty());
    }

    /**
     * TC-AUTH-055: a leavers list during a Term: a resident who withdrew gets a termination (reason Not enrolled); an
     * applicant's Application is rejected and the paid Deposit refunded by the rule "Not enrolled" (waiting for a
     * Manager); students not on a leavers list are not questioned.
     */
    @Test
    void leaversDuringTheTerm() throws Exception {
        stay.livesIn(7, "A-104", "A", true);
        stay.livesIn(9, "A-104", "B", true);
        String applicant = bearer(mvc, student(8));
        ApplyFlow.Applied app = flow.apply(applicant, "4-bed", "Basic", "{\"mode\":\"auto\"}");
        flow.pay(applicant, app.depositInvoiceId());
        String manager = bearer(mvc, MANAGER_A);
        String detail = upload(manager, stay.termId(), "leavers", "student_code,reason\nSE190007,Withdrawn\nSE190008,Thôi học\n")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.run.kind").value("Leavers list"))
                .andExpect(jsonPath("$.run.counts.notEnrolled").value(2))
                .andExpect(jsonPath("$.run.counts.notFound").value(0))
                .andReturn().getResponse().getContentAsString();
        String run = JsonPath.read(detail, "$.run.id");
        for (String code : new String[] { "SE190007", "SE190008" }) {
            stay.postJson("/reconciliations/" + run + "/items/" + item(detail, 1, code) + "/resolve", manager,
                    "{\"outcome\":\"Not enrolled\",\"note\":\"On the leavers list of the academic office.\"}")
                    .andExpect(status().isOk());
        }
        getAs("/terminations", manager)
                .andExpect(jsonPath("$.items[?(@.studentCode == 'SE190007')].reason", hasItem("Not enrolled")));
        assertThat(flow.statuses(applicant)).contains("Rejected");
        assertThat(jdbc.sql("""
                SELECT r.status FROM bil_refund r JOIN cfg_refund_rule c ON c.id = r.rule_id
                WHERE r.student_id = :s AND c.trigger_code = 'NOT_ENROLLED'
                """).param("s", stay.userId(student(8))).query(String.class).single()).isEqualTo("PENDING");
        assertThat(jdbc.sql("SELECT enrollment_status FROM auth_student WHERE student_code = 'SE190008'")
                .query(String.class).single()).isEqualTo("WITHDRAWN");
        assertThat(jdbc.sql("""
                SELECT count(*) FROM asg_termination t JOIN auth_user u ON u.id = t.student_id WHERE u.email = :e
                """).param("e", student(9)).query(Long.class).single()).isZero();
    }
}
