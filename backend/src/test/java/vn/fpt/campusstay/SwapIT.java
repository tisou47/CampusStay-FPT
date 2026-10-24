package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.StayFlow.student;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Bed swaps: direct invitations, the swap board, the Staff and Manager decisions (TC-REQ-010…012). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class SwapIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    ApplyFlow flow;
    StayFlow stay;

    @BeforeEach
    void openTerm() {
        flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private String invite(String from, String code) throws Exception {
        return JsonPath.read(stay.postJson("/swaps", from, "{\"studentCode\":\"%s\"}".formatted(code))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private ResultActions queue(String auth, String status) throws Exception {
        return mvc.perform(get("/swaps").param("termId", String.valueOf(stay.termId())).param("status", status)
                .header(HttpHeaders.AUTHORIZATION, auth));
    }

    /** TC-REQ-010: a direct swap: the partner accepts, Staff check and approve, the two students change Beds. */
    @Test
    void directSwap() throws Exception {
        stay.livesIn(8, "A-401", "A", true);
        stay.livesIn(9, "A-402", "A", true);
        String a = bearer(mvc, student(8));
        String b = bearer(mvc, student(9));
        stay.postJson("/swaps", a, "{\"studentCode\":\"SE190099\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.studentCode").value("This student cannot swap with you."));
        String id = invite(a, "SE190009");
        assertThat(id).startsWith("SW-");
        stay.postJson("/swaps", a, "{\"studentCode\":\"SE190009\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("OPEN_SWAP"));

        getAs("/swap-invitations/" + id, b)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Invited"))
                .andExpect(jsonPath("$.give.room").value("A-402"))
                .andExpect(jsonPath("$.get.room").value("A-401"))
                .andExpect(jsonPath("$.priceDifference").value(0));
        getAs("/students/me/requests?kind=room-changes", b)
                .andExpect(jsonPath("$.items[0].typeLabel").value("Swap"))
                .andExpect(jsonPath("$.items[0].invitationId").value(id));
        getAs("/notifications", b).andExpect(jsonPath("$.items[0].title").value("Swap request"));
        getAs("/swap-invitations/" + id, bearer(mvc, student(10))).andExpect(status().isNotFound());
        stay.postJson("/swap-invitations/" + id + "/respond", a, "{\"accept\":true}").andExpect(status().isNotFound());
        stay.postJson("/swap-invitations/" + id + "/respond", b, "{\"accept\":true}").andExpect(status().isNoContent());

        String staff = bearer(mvc, STAFF_A);
        queue(staff, "Waiting for Staff")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].kind").value("Direct"))
                .andExpect(jsonPath("$.items[0].a.room").value("A-401"))
                .andExpect(jsonPath("$.items[0].b.studentCode").value("SE190009"))
                .andExpect(jsonPath("$.items[0].checks[*].passed", everyItem(is(true))));
        stay.postJson("/swaps/" + id + "/decision", staff, "{\"decision\":\"Approved\"}").andExpect(status().isNoContent());
        assertThat(stay.roomOf(a)).isEqualTo("A-402");
        assertThat(stay.roomOf(b)).isEqualTo("A-401");
        getAs("/notifications", a).andExpect(jsonPath("$.items[0].title").value("Swap update"));
        queue(staff, "Approved").andExpect(jsonPath("$.items[0].decision.by").isString());
        stay.postJson("/swaps/" + id + "/decision", staff, "{\"decision\":\"Approved\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_DECIDED"));
    }

    /**
     * TC-REQ-011: the swap board: an anonymous post, a matching request, then the dearer Bed is invoiced and
     * the other student credited; a Bed the post does not want is refused.
     */
    @Test
    void swapBoard() throws Exception {
        stay.livesIn(11, "A-403", "A", true);
        stay.livesIn(12, "A-501", "A", true);
        String standard = bearer(mvc, student(11));
        String premium = bearer(mvc, student(12));
        mvc.perform(put("/swap-board/my-post").header(HttpHeaders.AUTHORIZATION, premium)
                .contentType(MediaType.APPLICATION_JSON).content("{\"roomTypeId\":\"%s\",\"roomClassId\":\"%s\"}"
                        .formatted(flow.roomTypeId("2-bed"), flow.roomClassId("Standard"))))
                .andExpect(status().isNoContent());
        getAs("/swap-board", premium)
                .andExpect(jsonPath("$.blocks", hasItem("A")))
                .andExpect(jsonPath("$.myPost.roomTypeId").value(flow.roomTypeId("2-bed")));
        String board = getAs("/swap-board", standard).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].offeredRoomClassName").value("Premium"))
                .andExpect(jsonPath("$.items[0].wants").value("2-bed · Standard · any Block"))
                .andExpect(jsonPath("$.items[0].priceDifference", greaterThan(0)))
                .andExpect(jsonPath("$.items[0].requested").value(false))
                .andReturn().getResponse().getContentAsString();
        String post = JsonPath.read(board, "$.items[0].id");
        String id = JsonPath.read(stay.postJson("/swap-board/posts/" + post + "/request", standard, "{}")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
        getAs("/swap-board", standard).andExpect(jsonPath("$.items[0].requested").value(true));
        stay.postJson("/swap-invitations/" + id + "/respond", premium, "{\"accept\":true}").andExpect(status().isNoContent());
        String staff = bearer(mvc, STAFF_A);
        queue(staff, "Waiting for Staff").andExpect(jsonPath("$.items[0].kind").value("Board match"));
        stay.postJson("/swaps/" + id + "/decision", staff, "{\"decision\":\"Approved\"}").andExpect(status().isNoContent());
        assertThat(stay.roomOf(standard)).isEqualTo("A-501");
        assertThat(stay.roomOf(premium)).isEqualTo("A-403");
        getAs("/students/me/invoices", standard)
                .andExpect(jsonPath("$.items[*].title", hasItem(containsString("Bed swap"))));
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_refund WHERE source_type = 'ROOM_CHANGE' AND status = 'PENDING' AND student_id = :s
                """).param("s", stay.userId(student(12))).query(Long.class).single()).isEqualTo(1);

        // The new Premium resident does not have what a 4-bed Basic post wants.
        mvc.perform(put("/swap-board/my-post").header(HttpHeaders.AUTHORIZATION, premium)
                .contentType(MediaType.APPLICATION_JSON).content("{\"roomTypeId\":\"%s\",\"roomClassId\":\"%s\"}"
                        .formatted(flow.roomTypeId("4-bed"), flow.roomClassId("Basic"))))
                .andExpect(status().isNoContent());
        String other = JsonPath.read(getAs("/swap-board", standard).andReturn().getResponse().getContentAsString(),
                "$.items[0].id");
        stay.postJson("/swap-board/posts/" + other + "/request", standard, "{}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_A_MATCH"));
    }

    /** TC-REQ-012: a swap across Blocks goes from Staff to the Block Manager, who decides it last. */
    @Test
    void crossBlockGoesToManager() throws Exception {
        stay.livesIn(13, "A-404", "A", true);
        stay.livesIn(14, "A-502", "A", true);
        String id = invite(bearer(mvc, student(13)), "SE190014");
        stay.postJson("/swap-invitations/" + id + "/respond", bearer(mvc, student(14)), "{\"accept\":true}")
                .andExpect(status().isNoContent());
        // The seed has one Block per gender, so mark this swap as crossing Blocks.
        jdbc.sql("UPDATE req_swap SET cross_block = TRUE WHERE id = :id")
                .param("id", Long.parseLong(id.substring("SW-".length()))).update();

        String staff = bearer(mvc, STAFF_A);
        stay.postJson("/swaps/" + id + "/decision", bearer(mvc, TestAuth.STAFF_B2), "{\"decision\":\"Approved\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));
        stay.postJson("/swaps/" + id + "/decision", staff, "{\"decision\":\"Approved\"}").andExpect(status().isNoContent());
        queue(staff, "To Manager").andExpect(jsonPath("$.items[0].id").value(id));
        stay.postJson("/swaps/" + id + "/decision", staff, "{\"decision\":\"Approved\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MANAGER_DECIDES"));
        stay.postJson("/swaps/" + id + "/decision", bearer(mvc, MANAGER_A), "{\"decision\":\"Rejected\"}")
                .andExpect(status().isNoContent());
        queue(staff, "Rejected")
                .andExpect(jsonPath("$.items[0].decision.reason").value("Rejected by a Manager"));
        assertThat(stay.roomOf(bearer(mvc, student(13)))).isEqualTo("A-404");
    }
}
