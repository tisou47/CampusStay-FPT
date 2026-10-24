package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

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

import vn.fpt.campusstay.service.request.EscalationService;

/** Requests past their timers escalate to the Block Manager, who hands them on (TC-REQ-016…018). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class EscalationIT {

    private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H',
            'D', 'R' };
    private static final String STAFF_A2 = "staff.a2@campusstay.test";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    EscalationService escalations;

    StayFlow stay;

    @BeforeEach
    void openTerm() {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
    }

    private String report(int student, String room) throws Exception {
        stay.livesIn(student, room, "A", true);
        return JsonPath.read(mvc.perform(multipart("/maintenance-requests")
                .file(new MockMultipartFile("photos", "leak.png", "image/png", PNG))
                .param("title", "Sink is blocked").param("description", "The sink drains very slowly.")
                .param("location", "Bathroom").param("category", "Plumbing").param("urgency", "Normal")
                .param("staffMayEnter", "true").header(HttpHeaders.AUTHORIZATION, bearer(mvc, StayFlow.student(student))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    /** Moves the report back in time, as if it had waited that long. */
    private void reportedHoursAgo(String code, int hours) {
        jdbc.sql("UPDATE mnt_request SET reported_at = now() - make_interval(hours => :h) WHERE code = :c")
                .param("h", hours).param("c", code).update();
    }

    private ResultActions list(String auth) throws Exception {
        return mvc.perform(get("/escalations").param("block", "A").header(HttpHeaders.AUTHORIZATION, auth));
    }

    private ResultActions act(String code, String auth, String body) throws Exception {
        return stay.postJson("/escalations/" + code + "/actions", auth, body);
    }

    /** TC-REQ-016: an unassigned request escalates, then passes its timer; the Manager reassigns it once. */
    @Test
    void maintenanceEscalatesAndIsReassigned() throws Exception {
        String code = report(1, "A-301");
        String manager = bearer(mvc, MANAGER_A);
        long a2 = stay.userId(STAFF_A2);
        reportedHoursAgo(code, 2);
        assertThat(escalations.scan()).isGreaterThanOrEqualTo(1);

        String item = "$.items[?(@.id == '" + code + "')]";
        list(manager).andExpect(status().isOk())
                .andExpect(jsonPath(item + ".kind").value(hasItem("maintenance")))
                .andExpect(jsonPath(item + ".why").value(hasItem("No assignee after 1 hour")))
                .andExpect(jsonPath(item + ".tone").value(hasItem("warning")))
                .andExpect(jsonPath(item + ".room").value(hasItem("A-301")))
                .andExpect(jsonPath(item + ".subtitle").value(hasItem("Plumbing · Normal")))
                .andExpect(jsonPath(item + ".openFor").value(hasItem(startsWith("2 h"))))
                .andExpect(jsonPath(item + ".suggestedAssigneeId").value(hasItem(String.valueOf(a2))))
                .andExpect(jsonPath(item + ".link").value(hasItem("/manager/maintenance/" + code)))
                .andExpect(jsonPath(item + ".canOfferTemporaryBed").value(hasItem(false)))
                .andExpect(jsonPath(item + ".events[0].text").value(hasItem("Escalated: No assignee after 1 hour")))
                .andExpect(jsonPath("$.assignees[*].name").value(hasItem("Vo Thanh Tung")));

        // Past the Block's 48-hour timer for normal requests: the same escalation becomes a breach.
        reportedHoursAgo(code, 50);
        escalations.scan();
        list(manager).andExpect(jsonPath(item + ".why").value(hasItem("Past the 48-hour limit")))
                .andExpect(jsonPath(item + ".tone").value(hasItem("error")));

        act(code, manager, "{\"action\":\"temporary-bed\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.action").exists());
        act(code, manager, "{\"action\":\"reassign\",\"assigneeId\":\"%d\"}".formatted(stay.userId(MANAGER_B)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.assigneeId").exists());
        act(code, bearer(mvc, TestAuth.STAFF_A), "{\"action\":\"reassign\",\"assigneeId\":\"%d\"}".formatted(a2))
                .andExpect(status().isForbidden());
        act(code, manager, "{\"action\":\"reassign\",\"assigneeId\":\"%d\",\"note\":\"Please go today.\"}".formatted(a2))
                .andExpect(status().isNoContent());

        assertThat(jdbc.sql("SELECT assignee_id FROM mnt_request WHERE code = :c").param("c", code).query(Long.class)
                .single()).isEqualTo(a2);
        list(manager).andExpect(jsonPath(item + ".handled.action").value(hasItem("Reassigned to Vo Thanh Tung")))
                .andExpect(jsonPath(item + ".handled.note").value(hasItem("Please go today.")))
                .andExpect(jsonPath(item + ".ownerName").value(hasItem("Vo Thanh Tung")))
                .andExpect(jsonPath(item + ".suggestedAssigneeId").value(hasItem((Object) null)));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_A2)))
                .andExpect(jsonPath("$.items[*].title").value(hasItem("Escalated request assigned to you")));
        act(code, manager, "{\"action\":\"reassign\",\"assigneeId\":\"%d\"}".formatted(a2))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ESCALATION_HANDLED"));

        // A request escalates once per reason: the next scan leaves it alone.
        escalations.scan();
        assertThat(jdbc.sql("SELECT count(*) FROM req_escalation WHERE source_code = :c AND status = 'OPEN'")
                .param("c", code).query(Long.class).single()).isZero();
    }

    /** TC-REQ-017: an escalation closes by itself once the request is back on track. */
    @Test
    void escalationClosesWhenTheRequestIsAssigned() throws Exception {
        String code = report(2, "A-302");
        reportedHoursAgo(code, 3);
        escalations.scan();
        jdbc.sql("UPDATE mnt_request SET assignee_id = :a, status = 'ASSIGNED' WHERE code = :c")
                .param("a", stay.userId(STAFF_A2)).param("c", code).update();
        escalations.scan();

        String item = "$.items[?(@.id == '" + code + "')]";
        list(bearer(mvc, MANAGER_A))
                .andExpect(jsonPath(item + ".handled.action").value(hasItem("Closed automatically")))
                .andExpect(jsonPath(item + ".handled.note").value(hasItem("The request now has an assignee.")));
    }

    /** TC-REQ-018: an undecided Room-Change Request escalates; the Manager offers a temporary Bed; Manager only. */
    @Test
    void roomChangeEscalatesAndGetsATemporaryBed() throws Exception {
        stay.livesIn(3, "A-303", "A", true);
        String code = JsonPath.read(stay.postJson("/room-changes", bearer(mvc, StayFlow.student(3)),
                "{\"kind\":\"same\",\"reason\":\"Health\"}").andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(), "$.id");
        jdbc.sql("""
                UPDATE req_room_change SET submitted_at = now() - interval '80 hours',
                       sla_due_at = now() - interval '8 hours'
                WHERE code = :c
                """).param("c", code).update();
        escalations.scan();

        String manager = bearer(mvc, MANAGER_A);
        String item = "$.items[?(@.id == '" + code + "')]";
        list(manager).andExpect(jsonPath(item + ".kind").value(hasItem("room-change")))
                .andExpect(jsonPath(item + ".why").value(hasItem("Undecided after 72 hours")))
                .andExpect(jsonPath(item + ".room").value(hasItem("A-303")))
                .andExpect(jsonPath(item + ".subtitle").value(hasItem("Health")))
                .andExpect(jsonPath(item + ".canOfferTemporaryBed").value(hasItem(true)));

        list(bearer(mvc, STAFF_A)).andExpect(status().isForbidden());
        act(code, manager, "{\"action\":\"move\"}").andExpect(status().isBadRequest());
        act(code, manager, "{\"action\":\"temporary-bed\",\"note\":\"A-310 bed C until a Bed frees up.\"}")
                .andExpect(status().isNoContent());
        list(manager).andExpect(jsonPath(item + ".handled.action").value(hasItem("Temporary Bed offered")))
                .andExpect(jsonPath(item + ".canOfferTemporaryBed").value(hasItem(false)));
        act("RC-NONE-000000", manager, "{\"action\":\"temporary-bed\"}").andExpect(status().isNotFound());
    }
}
