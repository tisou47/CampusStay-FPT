package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.util.List;

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

import vn.fpt.campusstay.service.assignment.DoorCodeRelease;
import vn.fpt.campusstay.service.assignment.ForfeitService;

/**
 * Residence (ADR-23, spec §6.6, §6.8, §11.5): the door code released once the Balance is paid, the check-in start has
 * come and the Room's code is confirmed; Bed states on the room map; the forfeit of an unpaid Balance (TC-ASG-032…034).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ResidenceIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    DoorCodeRelease release;

    @Autowired
    ForfeitService forfeits;

    ApplyFlow flow;
    StayFlow stay;

    @BeforeEach
    void setUp() {
        flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private String balanceOf(String applicationCode) {
        return jdbc.sql("""
                SELECT i.code FROM bil_invoice i JOIN app_application a ON a.id = i.application_id
                WHERE a.code = :app AND i.type = 'BALANCE'
                """).param("app", applicationCode).query(String.class).single();
    }

    /** The state of the student's Bed on the room map of its Floor. */
    private String bedState(String room, String bedCode) throws Exception {
        String floor = room.substring(2, 3);
        String json = getAs("/inventory/rooms?termId=" + stay.termId() + "&block=A&floor=" + floor, bearer(mvc, MANAGER_A))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> states = com.jayway.jsonpath.JsonPath.read(json,
                "$.rooms[*].beds[?(@.id == '" + bedCode + "')].state");
        return states.getFirst();
    }

    private String bedOf(String auth) throws Exception {
        String json = getAs("/students/me/allocation?termId=" + stay.termId(), auth).andReturn().getResponse()
                .getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.allocation.room") + "-"
                + com.jayway.jsonpath.JsonPath.read(json, "$.allocation.bed");
    }

    /**
     * TC-ASG-032: assigned and unpaid (yellow); paid but before the check-in start, then without a Room code, the
     * student waits (no code); Staff confirm the Room's code and it is released: the student is a resident (orange),
     * is told and sees the code; a student who pays later receives the current code at once.
     */
    @Test
    void doorCodeIsReleasedToPaidResidents() throws Exception {
        List<StayFlow.Applied> placed = stay.runRound1("2-bed", "Standard", 3, 4);
        StayFlow.Applied first = placed.get(0);
        String room = stay.roomOf(first.auth());
        String bed = bedOf(first.auth());
        getAs("/students/me/allocation", first.auth())
                .andExpect(jsonPath("$.allocation.status").value("Assigned – unpaid"))
                .andExpect(jsonPath("$.allocation.codeReleased").value(false))
                .andExpect(jsonPath("$.stayTerms").value(1));
        getAs("/students/me/door-code", first.auth())
                .andExpect(jsonPath("$.status").value("Not ready"))
                .andExpect(jsonPath("$.note").value("You receive the door code once your Balance is paid."));
        assertThat(bedState(room, bed)).isEqualTo("unpaid");

        flow.pay(first.auth(), balanceOf(first.applicationId()));
        getAs("/students/me/allocation", first.auth())
                .andExpect(jsonPath("$.allocation.status").value("Paid – waiting for the door code"));
        getAs("/students/me/door-code", first.auth())
                .andExpect(jsonPath("$.note").value("You receive the door code on 02/01/2031, when check-in starts."));
        assertThat(bedState(room, bed)).isEqualTo("paid");

        jdbc.sql("UPDATE cfg_term SET check_in_start = current_date - 1 WHERE code = :code")
                .param("code", ApplyFlow.TERM_CODE).update();
        assertThat(release.releaseDue()).isZero();
        getAs("/students/me/door-code", first.auth())
                .andExpect(jsonPath("$.note").value(
                        "Staff are setting the door code of your Room. You will be told when it is ready."));

        String staff = bearer(mvc, STAFF_A);
        mvc.perform(post("/door-codes/" + room).header(HttpHeaders.AUTHORIZATION, staff)
                .contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"246813\"}")).andExpect(status().isOk());
        mvc.perform(post("/door-codes/" + room + "/confirm").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isNoContent());
        getAs("/students/me/allocation", first.auth())
                .andExpect(jsonPath("$.allocation.status").value("Resident"))
                .andExpect(jsonPath("$.allocation.codeReleased").value(true))
                .andExpect(jsonPath("$.allocation.residentSince").isString());
        mvc.perform(post("/students/me/door-code/reveal").header(HttpHeaders.AUTHORIZATION, first.auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("246813"));
        getAs("/notifications", first.auth())
                .andExpect(jsonPath("$.items[*].title", hasItem("Your door code is ready · Room " + room)));
        assertThat(bedState(room, bed)).isEqualTo("resident");

        // The roommate pays later: the Room's code is released at once (the payment's transaction).
        StayFlow.Applied second = placed.get(1);
        if (room.equals(stay.roomOf(second.auth()))) {
            flow.pay(second.auth(), balanceOf(second.applicationId()));
            getAs("/students/me/door-code", second.auth()).andExpect(jsonPath("$.status").value("Ready"));
        }
        // The release is idempotent.
        assertThat(release.releaseDue()).isZero();
    }

    /**
     * TC-ASG-033 (business rule): a Balance past its deadline without a claim is forfeited: the Allocation is
     * cancelled, the Balance void, the Application Forfeited, the Deposit kept by the rule "Balance not paid" (a 0 %
     * rule records no refund; a 10 % rule one refund, never two) and the student told; a claim waiting or an approved
     * late check-in still running keeps the Bed.
     */
    @Test
    void unpaidBalanceIsForfeited() throws Exception {
        List<StayFlow.Applied> placed = stay.runRound1("4-bed", "Basic", 5, 6, 7);
        StayFlow.Applied unpaid = placed.get(0);
        StayFlow.Applied claimed = placed.get(1);
        StayFlow.Applied late = placed.get(2);
        String room = stay.roomOf(unpaid.auth());
        String bed = bedOf(unpaid.auth());
        for (StayFlow.Applied p : placed) {
            jdbc.sql("UPDATE bil_invoice SET due_at = now() + interval '1 hour' WHERE code = :c")
                    .param("c", balanceOf(p.applicationId())).update();
        }
        flow.claim(claimed.auth(), balanceOf(claimed.applicationId())).andExpect(status().isOk());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .multipart("/students/me/late-check-in").file("evidence", ApplyFlow.PNG)
                .param("reason", "Flight on 07/01").param("requestedFor", "2031-01-07")
                .header(HttpHeaders.AUTHORIZATION, late.auth())).andExpect(status().isOk());
        String requestId = jdbc.sql("""
                SELECT l.id::text FROM asg_late_check_in l JOIN asg_allocation a ON a.id = l.allocation_id
                JOIN app_application ap ON ap.id = a.application_id WHERE ap.code = :app
                """).param("app", late.applicationId()).query(String.class).single();
        mvc.perform(post("/late-check-ins/" + requestId + "/decision").header(HttpHeaders.AUTHORIZATION,
                bearer(mvc, MANAGER_A)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"Approved\",\"deadline\":\"2031-01-08\"}")).andExpect(status().isNoContent());
        for (StayFlow.Applied p : placed) {
            jdbc.sql("UPDATE bil_invoice SET due_at = now() - interval '1 minute' WHERE code = :c AND due_at < now() + interval '1 day'")
                    .param("c", balanceOf(p.applicationId())).update();
        }

        assertThat(forfeits.forfeitDue()).isEqualTo(1);
        assertThat(forfeits.forfeitDue()).isZero();
        assertThat(flow.statuses(unpaid.auth())).containsExactly("Forfeited");
        getAs("/invoices/" + balanceOf(unpaid.applicationId()), unpaid.auth()).andExpect(jsonPath("$.status").value("Void"));
        getAs("/students/me/allocation?termId=" + stay.termId(), unpaid.auth())
                .andExpect(jsonPath("$.allocation").value((Object) null))
                .andExpect(jsonPath("$.application.status").value("Forfeited"));
        getAs("/notifications", unpaid.auth()).andExpect(jsonPath("$.items[*].title", hasItem("Bed released · Room " + room)));
        assertThat(bedState(room, bed)).isEqualTo("available");
        assertThat(jdbc.sql("SELECT count(*) FROM bil_refund WHERE source_type = 'FORFEIT'").query(Long.class).single())
                .isZero();
        assertThat(flow.statuses(claimed.auth())).containsExactly("Allocated");
        assertThat(flow.statuses(late.auth())).containsExactly("Allocated");
        assertThat(jdbc.sql("SELECT due_at FROM bil_invoice WHERE code = :c").param("c", balanceOf(late.applicationId()))
                .query(java.sql.Timestamp.class).single().toInstant())
                .isEqualTo(java.time.Instant.parse("2031-01-08T17:00:00Z"));
        // A new student applies again for the Term: the forfeited Application still counts (one per Term).
        mvc.perform(post("/applications").header(HttpHeaders.AUTHORIZATION, unpaid.auth())
                .contentType(MediaType.APPLICATION_JSON).content(flow.body("4-bed", "Basic", null)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_ELIGIBLE"));

        // With a 10 % rule the Deposit refund is recorded once (System approver: approved at once).
        jdbc.sql("UPDATE cfg_refund_rule SET refund_percent = 10 WHERE trigger_code = 'BALANCE_NOT_PAID'").update();
        StayFlow.Applied next = stay.runRound1("4-bed", "Basic", 8).getFirst();
        jdbc.sql("UPDATE bil_invoice SET due_at = now() - interval '1 minute' WHERE code = :c")
                .param("c", balanceOf(next.applicationId())).update();
        assertThat(forfeits.forfeitDue()).isEqualTo(1);
        assertThat(forfeits.forfeitDue()).isZero();
        assertThat(jdbc.sql("SELECT amount FROM bil_refund WHERE source_type = 'FORFEIT' AND status = 'APPROVED'")
                .query(Long.class).list()).containsExactly(120_000L);
    }

    /** TC-ASG-034: a Balance whose claims are rejected twice is cancelled with its Allocation (spec §6.7). */
    @Test
    void rejectedClaimsCancelTheBalance() throws Exception {
        StayFlow.Applied p = stay.runRound1("6-bed", "Basic", 9).getFirst();
        String balance = balanceOf(p.applicationId());
        String manager = bearer(mvc, MANAGER_A);
        for (int i = 0; i < 2; i++) {
            flow.claim(p.auth(), balance).andExpect(status().isOk());
            mvc.perform(post("/payment-claims/reject").header(HttpHeaders.AUTHORIZATION, manager)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"invoiceIds\":[\"" + balance + "\"],\"reason\":\"Not received.\"}"))
                    .andExpect(jsonPath("$.cancelled").value(i));
        }
        assertThat(flow.statuses(p.auth())).containsExactly("Forfeited");
        getAs("/invoices/" + balance, p.auth()).andExpect(jsonPath("$.status").value("Void"));
        assertThat(jdbc.sql("""
                SELECT a.end_reason FROM asg_allocation a JOIN app_application ap ON ap.id = a.application_id
                WHERE ap.code = :app
                """).param("app", p.applicationId()).query(String.class).list()).contains("FORFEIT");
        getAs("/applications/" + p.applicationId(), p.auth())
                .andExpect(jsonPath("$.events[*].title", hasItem("Bed released: the Balance transfer was not confirmed")));
        getAs("/notifications", p.auth()).andExpect(jsonPath("$.items[*].title",
                hasItem("Balance · " + ApplyFlow.TERM_NAME + " cancelled")));
    }
}
