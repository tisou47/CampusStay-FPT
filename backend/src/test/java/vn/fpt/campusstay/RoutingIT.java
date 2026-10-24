package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.time.Duration;
import java.time.Instant;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Block Manager › Routing rules and escalation timers; new requests follow the rules (TC-REQ-013…015). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class RoutingIT {

    private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H',
            'D', 'R' };
    private static final String STAFF_A2 = "staff.a2@campusstay.test";
    private static final String STAFF_AB = "staff.ab@campusstay.test";
    /** Only its id is used: AuthFlowIT locks this account. */
    private static final String STAFF_B1 = "staff.b1@campusstay.test";

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    StayFlow stay;

    @BeforeEach
    void openTerm() {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private ResultActions putAs(String path, String auth, String body) throws Exception {
        return mvc.perform(put(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private String rule(String auth, String body) throws Exception {
        return JsonPath.read(stay.postJson("/routing-rules", auth, body).andExpect(status().isOk()).andReturn()
                .getResponse().getContentAsString(), "$.id");
    }

    private String report(String auth, String category) throws Exception {
        return JsonPath.read(mvc.perform(multipart("/maintenance-requests")
                .file(new MockMultipartFile("photos", "leak.png", "image/png", PNG))
                .param("title", "Light flickers").param("description", "The ceiling light flickers all evening.")
                .param("location", "Bathroom").param("category", category).param("urgency", "Normal")
                .param("staffMayEnter", "true").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private Long assigneeOf(String code) {
        return jdbc.sql("SELECT assignee_id FROM mnt_request WHERE code = :c").param("c", code)
                .query(Long.class).single();
    }

    /** TC-REQ-013: rules, gaps and timers of the Block; validation; Manager only, in scope. */
    @Test
    void rulesAndTimers() throws Exception {
        String manager = bearer(mvc, MANAGER_B);
        long b1 = stay.userId(STAFF_B1);
        long ab = stay.userId(STAFF_AB);
        getAs("/routing-rules?block=B", manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.types", contains("Maintenance", "Room change", "Swap", "Payment", "Late check-in")))
                .andExpect(jsonPath("$.categories[0]").value("All"))
                .andExpect(jsonPath("$.categories").value(hasItem("Plumbing")))
                .andExpect(jsonPath("$.staff[*].name").value(hasItem("Do Ngoc Lan")))
                .andExpect(jsonPath("$.gaps[*].title").value(hasItem("Maintenance · All")))
                .andExpect(jsonPath("$.timers.urgent").value("4 hours"))
                .andExpect(jsonPath("$.timers.normal").value("48 hours"))
                .andExpect(jsonPath("$.timers.roomChange").value("72 hours"))
                .andExpect(jsonPath("$.timerOptions.urgent", contains("1 hour", "2 hours", "4 hours", "8 hours")));

        stay.postJson("/routing-rules", manager, """
                {"block":"B","type":"Room change","scope":"Plumbing","assigneeId":"%d"}""".formatted(b1))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.scope").exists());
        stay.postJson("/routing-rules", manager, """
                {"block":"B","type":"Maintenance","scope":"All","assigneeId":"%d","fallbackId":"%d"}"""
                .formatted(b1, b1))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.fallbackId").exists());
        stay.postJson("/routing-rules", manager, """
                {"block":"B","type":"Maintenance","scope":"All","assigneeId":"%d"}""".formatted(stay.userId(STAFF_A2)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.assigneeId").exists());

        String id = rule(manager, """
                {"block":"B","type":"Maintenance","scope":"Plumbing","condition":"Leaks first",
                 "assigneeId":"%d","fallbackId":"%d"}""".formatted(b1, ab));
        getAs("/routing-rules?block=B", manager)
                .andExpect(jsonPath("$.rules", hasSize(1)))
                .andExpect(jsonPath("$.rules[0].type").value("Maintenance"))
                .andExpect(jsonPath("$.rules[0].scope").value("Plumbing"))
                .andExpect(jsonPath("$.rules[0].condition").value("Leaks first"))
                .andExpect(jsonPath("$.rules[0].assigneeName").value("Do Ngoc Lan"))
                .andExpect(jsonPath("$.rules[0].fallbackName").value("Huynh Gia Bao"))
                .andExpect(jsonPath("$.rules[0].active").value(true));
        putAs("/routing-rules/" + id, manager, "{\"active\":false,\"fallbackId\":null}")
                .andExpect(status().isNoContent());
        getAs("/routing-rules?block=B", manager)
                .andExpect(jsonPath("$.rules[0].active").value(false))
                .andExpect(jsonPath("$.rules[0].fallbackId").value((Object) null))
                .andExpect(jsonPath("$.rules[0].assigneeName").value("Do Ngoc Lan"));

        putAs("/routing-rules/timers", manager, """
                {"block":"B","urgent":"12 hours","normal":"24 hours","roomChange":"48 hours"}""")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.urgent").exists());
        putAs("/routing-rules/timers", manager, """
                {"block":"B","urgent":"2 hours","normal":"24 hours","roomChange":"48 hours"}""")
                .andExpect(status().isNoContent());
        getAs("/routing-rules?block=B", manager)
                .andExpect(jsonPath("$.timers.urgent").value("2 hours"))
                .andExpect(jsonPath("$.timers.roomChange").value("48 hours"));

        // Staff may not manage routing; every Manager may manage every Block (ADR-19).
        getAs("/routing-rules?block=A", bearer(mvc, STAFF_A)).andExpect(status().isForbidden());
        getAs("/routing-rules?block=B", bearer(mvc, MANAGER_A)).andExpect(status().isOk());
        putAs("/routing-rules/" + id, bearer(mvc, STAFF_A), "{\"active\":true}").andExpect(status().isForbidden());
        putAs("/routing-rules/999999", manager, "{\"active\":true}").andExpect(status().isNotFound());
    }

    /** TC-REQ-014: a new Maintenance Request goes to the category rule first, else All; off duty → fallback. */
    @Test
    void maintenanceFollowsTheRules() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        long a2 = stay.userId(STAFF_A2);
        long ab = stay.userId(STAFF_AB);
        long a1 = stay.userId(STAFF_A);
        rule(manager, """
                {"block":"A","type":"Maintenance","scope":"All","assigneeId":"%d","fallbackId":"%d"}""".formatted(a2, ab));
        rule(manager, """
                {"block":"A","type":"Maintenance","scope":"Electrical","assigneeId":"%d"}""".formatted(a1));
        stay.livesIn(11, "A-201", "A", true);
        String student = bearer(mvc, StayFlow.student(11));

        String electrical = report(student, "Electrical");
        assertThat(assigneeOf(electrical)).isEqualTo(a1);
        getAs("/maintenance-requests/" + electrical, manager)
                .andExpect(jsonPath("$.status").value("Assigned"))
                .andExpect(jsonPath("$.assignee.name").value("Nguyen Van Binh"));

        assertThat(assigneeOf(report(student, "Plumbing"))).isEqualTo(a2);
        jdbc.sql("UPDATE auth_staff_profile SET on_duty = FALSE WHERE user_id = :u").param("u", a2).update();
        assertThat(assigneeOf(report(student, "Furniture"))).isEqualTo(ab);
    }

    /** TC-REQ-015: a Room-Change Request goes to the Block's rule and is due after the Block's timer. */
    @Test
    void roomChangesFollowTheRules() throws Exception {
        long a1 = stay.userId(STAFF_A);
        rule(bearer(mvc, MANAGER_A), """
                {"block":"A","type":"Room change","scope":"All","assigneeId":"%d"}""".formatted(a1));
        stay.livesIn(12, "A-202", "A", true);
        String code = JsonPath.read(stay.postJson("/room-changes", bearer(mvc, StayFlow.student(12)),
                "{\"kind\":\"same\",\"reason\":\"Health\"}").andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(), "$.id");

        record Row(Long assignee, Instant submitted, Instant due) {
        }
        Row row = jdbc.sql("SELECT assignee_id, submitted_at, sla_due_at FROM req_room_change WHERE code = :c")
                .param("c", code)
                .query((rs, i) -> new Row(rs.getObject("assignee_id", Long.class),
                        rs.getTimestamp("submitted_at").toInstant(), rs.getTimestamp("sla_due_at").toInstant()))
                .single();
        assertThat(row.assignee()).isEqualTo(a1);
        int hours = jdbc.sql("""
                SELECT p.room_change_hours FROM req_sla_policy p JOIN inv_building b ON b.id = p.building_id
                WHERE b.code = 'A'
                """).query(Integer.class).single();
        assertThat(Duration.between(row.submitted(), row.due())).isEqualTo(Duration.ofHours(hours));
    }
}
