package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.service.assignment.RenewalService;

/**
 * Next-Term Bed swaps (spec §6.10): direct invitations and the swap board of the requests window, Staff decide and a
 * Manager decides last across Blocks; the two next-Term Beds change hands and each student pays the next Term's price
 * of the Bed they get, with no price difference, charge or credit (TC-REQ-010…012).
 */
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

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private String invite(String from, String code) throws Exception {
        return JsonPath.read(stay.postJson("/swaps", from, "{\"studentCode\":\"%s\"}".formatted(code))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private ResultActions queue(String auth, String status) throws Exception {
        return mvc.perform(get("/swaps").param("termId", String.valueOf(next)).param("status", status)
                .header(HttpHeaders.AUTHORIZATION, auth));
    }

    /** The student's Room in the next Term. */
    private String nextRoom(String auth) throws Exception {
        return JsonPath.read(getAs("/students/me/allocation", auth).andReturn().getResponse().getContentAsString(),
                "$.nextTerm.room");
    }

    /**
     * TC-REQ-010: a direct swap of next-Term Beds: the partner accepts, Staff check and approve, the two next-Term
     * Allocations exchange Beds while both students stay where they live this Term.
     */
    @Test
    void directSwap() throws Exception {
        renewal.resident(8, "A-401", "A", 2);
        renewal.resident(9, "A-402", "A", 2);
        renewals.openDue();
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
                .andExpect(jsonPath("$.termName").value(RenewalFlow.NEXT_NAME))
                .andExpect(jsonPath("$.give.room").value("A-402"))
                .andExpect(jsonPath("$.get.room").value("A-401"))
                .andExpect(jsonPath("$.get.termPrice").value(renewal.nextPrice("2-bed", "Standard")))
                .andExpect(jsonPath("$.priceDifference").doesNotExist());
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
        assertThat(nextRoom(a)).isEqualTo("A-402");
        assertThat(nextRoom(b)).isEqualTo("A-401");
        assertThat(stay.roomOf(a)).isEqualTo("A-401");
        assertThat(jdbc.sql("SELECT count(*) FROM bil_invoice").query(Long.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM bil_refund").query(Long.class).single()).isZero();
        getAs("/notifications", a).andExpect(jsonPath("$.items[0].title").value("Swap update"));
        queue(staff, "Approved").andExpect(jsonPath("$.items[0].decision.by").isString());
        stay.postJson("/swaps/" + id + "/decision", staff, "{\"decision\":\"Approved\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_DECIDED"));
    }

    /**
     * TC-REQ-011: the swap board of the window: an anonymous post of a next-Term Bed with its next-Term price, a
     * matching request, the swap without any charge or credit; a Bed the post does not want is refused.
     */
    @Test
    void swapBoard() throws Exception {
        renewal.resident(11, "A-403", "A", 2);
        renewal.resident(12, "A-501", "A", 2);
        renewals.openDue();
        String standard = bearer(mvc, student(11));
        String premium = bearer(mvc, student(12));
        mvc.perform(put("/swap-board/my-post").header(HttpHeaders.AUTHORIZATION, premium)
                .contentType(MediaType.APPLICATION_JSON).content("{\"roomTypeId\":\"%s\",\"roomClassId\":\"%s\"}"
                        .formatted(flow.roomTypeId("2-bed"), flow.roomClassId("Standard"))))
                .andExpect(status().isNoContent());
        getAs("/swap-board", premium)
                .andExpect(jsonPath("$.blocks", hasItem("A")))
                .andExpect(jsonPath("$.window.termName").value(RenewalFlow.NEXT_NAME))
                .andExpect(jsonPath("$.myPost.roomTypeId").value(flow.roomTypeId("2-bed")));
        String board = getAs("/swap-board", standard).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].offeredRoomClassName").value("Premium"))
                .andExpect(jsonPath("$.items[0].wants").value("2-bed · Standard · any Block"))
                .andExpect(jsonPath("$.items[0].termPrice").value(renewal.nextPrice("2-bed", "Premium")))
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
        assertThat(nextRoom(standard)).isEqualTo("A-501");
        assertThat(nextRoom(premium)).isEqualTo("A-403");
        getAs("/students/me/allocation", standard)
                .andExpect(jsonPath("$.nextTerm.termPrice").value(renewal.nextPrice("2-bed", "Premium")));
        assertThat(jdbc.sql("SELECT count(*) FROM bil_invoice").query(Long.class).single()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM bil_refund").query(Long.class).single()).isZero();

        // The Premium Bed's new holder does not have what a 4-bed Basic post wants.
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

    /**
     * TC-REQ-012: a swap across Blocks goes from Staff to a Manager, who decides it last; once filing closed and the
     * next-Term fees are issued no swap is carried out any more.
     */
    @Test
    void crossBlockGoesToManager() throws Exception {
        renewal.resident(13, "A-404", "A", 2);
        renewal.resident(14, "A-502", "A", 2);
        renewals.openDue();
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
        jdbc.sql("UPDATE asg_renewal SET fees_issued_at = now(), fees_issued_by = (SELECT id FROM auth_user WHERE email = :m)")
                .param("m", MANAGER_A).update();
        stay.postJson("/swaps/" + id + "/decision", bearer(mvc, MANAGER_A), "{\"decision\":\"Approved\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("FEES_ISSUED"));
        stay.postJson("/swaps/" + id + "/decision", bearer(mvc, MANAGER_A), "{\"decision\":\"Rejected\"}")
                .andExpect(status().isNoContent());
        queue(staff, "Rejected")
                .andExpect(jsonPath("$.items[0].decision.reason").value("Rejected by a Manager"));
        assertThat(nextRoom(bearer(mvc, student(13)))).isEqualTo("A-404");
    }
}
