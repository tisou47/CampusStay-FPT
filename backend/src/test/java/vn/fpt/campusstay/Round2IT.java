package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.util.List;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.service.application.Round2Service;

/**
 * Round 2 for Waitlisted students: held options, accept, decline and expiry, the Manager's run, withdrawing and the
 * end of the waitlist (TC-APP-020, 021, 024…026).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class Round2IT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    Round2Service round2;

    ApplyFlow flow;
    StayFlow stay;

    @BeforeEach
    void openTerm() {
        flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
        // No 6-bed Premium Bed is free in Block A: those Applications are waitlisted in Round 1.
        jdbc.sql("""
                UPDATE inv_room SET status = 'OUT_OF_SERVICE', oos_since = now(), oos_reason = 'MAINTENANCE'
                WHERE code IN ('A-509', 'A-510') AND status = 'IN_SERVICE'
                """).update();
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    /**
     * TC-APP-020 and TC-APP-021: three Waitlisted students each get held options in partly filled Rooms. One
     * accepts (Allocated with a Balance), one declines and one does not answer: both are cancelled and their
     * paid Deposits wait as refunds for the Block Manager.
     */
    @Test
    void round2Lifecycle() throws Exception {
        List<StayFlow.Applied> applied = stay.runRound1("6-bed", "Premium", 15, 16, 17);
        StayFlow.Applied accepts = applied.get(0);
        StayFlow.Applied declines = applied.get(1);
        StayFlow.Applied silent = applied.get(2);
        for (StayFlow.Applied a : applied) {
            assertThat(flow.statuses(a.auth())).containsExactly("Waitlisted");
        }
        assertThat(jdbc.sql("SELECT count(DISTINCT bed_id) = count(*) FROM app_round2_option WHERE held")
                .query(Boolean.class).single()).isTrue();

        String offer = getAs("/students/me/round2-offer", accepts.auth())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.offer.termName").value(ApplyFlow.TERM_NAME))
                .andExpect(jsonPath("$.offer.application.id").value(accepts.applicationId()))
                .andExpect(jsonPath("$.offer.application.roomTypeName").value("6-bed"))
                .andExpect(jsonPath("$.offer.application.depositPaid").isNumber())
                .andExpect(jsonPath("$.offer.options[0].block").value("A"))
                .andExpect(jsonPath("$.offer.options[0].note", startsWith("Room A-")))
                .andExpect(jsonPath("$.offer.options[0].fill", endsWith("%")))
                .andReturn().getResponse().getContentAsString();
        List<Object> options = JsonPath.read(offer, "$.offer.options");
        assertThat(options).hasSizeBetween(1, 3);
        getAs("/notifications", accepts.auth()).andExpect(jsonPath("$.items[*].title", hasItem("New room options")))
                .andExpect(jsonPath("$.items[*].title", hasItem("You are on the waitlist")));

        String offerId = JsonPath.read(offer, "$.offer.id");
        String optionId = JsonPath.read(offer, "$.offer.options[0].id");
        stay.postJson("/round2-offers/" + offerId + "/respond", accepts.auth(), "{\"accept\":true}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.optionId").isString());
        stay.postJson("/round2-offers/" + offerId + "/respond", declines.auth(), "{\"accept\":false}")
                .andExpect(status().isNotFound());
        stay.postJson("/round2-offers/" + offerId + "/respond", accepts.auth(),
                "{\"accept\":true,\"optionId\":\"%s\"}".formatted(optionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.balanceInvoiceId", startsWith("INV-" + ApplyFlow.TERM_CODE + "-")));
        assertThat(flow.statuses(accepts.auth())).containsExactly("Allocated");
        assertThat(stay.roomOf(accepts.auth())).startsWith("A-");
        getAs("/students/me/round2-offer", accepts.auth()).andExpect(jsonPath("$.offer").value((Object) null));
        stay.postJson("/round2-offers/" + offerId + "/respond", accepts.auth(),
                "{\"accept\":true,\"optionId\":\"%s\"}".formatted(optionId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("OFFER_CLOSED"));

        String declined = JsonPath.read(getAs("/students/me/round2-offer", declines.auth())
                .andReturn().getResponse().getContentAsString(), "$.offer.id");
        stay.postJson("/round2-offers/" + declined + "/respond", declines.auth(), "{\"accept\":false}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.balanceInvoiceId").value((Object) null));
        assertThat(flow.statuses(declines.auth())).containsExactly("Cancelled");

        jdbc.sql("""
                UPDATE app_round2_offer SET expires_at = now() - interval '1 minute'
                WHERE status = 'PENDING' AND application_id = (SELECT id FROM app_application WHERE code = :code)
                """).param("code", silent.applicationId()).update();
        assertThat(round2.expire()).isEqualTo(1);
        assertThat(flow.statuses(silent.auth())).containsExactly("Cancelled");
        assertThat(jdbc.sql("""
                SELECT count(*) FROM app_round2_option o JOIN app_round2_offer f ON f.id = o.offer_id
                JOIN app_application a ON a.id = f.application_id WHERE a.code = :code AND o.held
                """).param("code", silent.applicationId()).query(Long.class).single()).isZero();
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_refund WHERE source_type = 'APPLICATION_CANCEL' AND status = 'PENDING'
                  AND amount > 0
                """).query(Long.class).single()).isEqualTo(2);
    }

    /** Applied, paid and approved, then left without a Bed by Round 1 (as the commit of a Block does). */
    private StayFlow.Applied waitlisted(int student) throws Exception {
        String auth = bearer(mvc, StayFlow.student(student));
        ApplyFlow.Applied app = flow.apply(auth, "6-bed", "Premium", "{\"mode\":\"auto\"}");
        flow.pay(auth, app.depositInvoiceId());
        stay.postJson("/applications/bulk-review", bearer(mvc, MANAGER_A),
                "{\"ids\":[\"%s\"],\"decision\":\"Approved\"}".formatted(app.id())).andExpect(status().isOk());
        jdbc.sql("UPDATE app_application SET status = 'WAITLISTED' WHERE code = :code").param("code", app.id()).update();
        return new StayFlow.Applied(auth, app.id());
    }

    private long pendingRefunds(String applicationId) {
        return jdbc.sql("""
                SELECT coalesce(sum(r.amount), 0) FROM bil_refund r JOIN app_application a ON a.id = r.source_id
                WHERE r.source_type = 'APPLICATION_CANCEL' AND r.status = 'PENDING' AND a.code = :code
                """).param("code", applicationId).query(Long.class).single();
    }

    /**
     * TC-APP-025: a waitlisted student sees the open offer, the day the waitlist ends and the refund; withdrawing
     * closes the offer, releases its Beds, cancels the Application and asks a Manager to refund the whole Deposit,
     * whose list shows the student's bank account (A-61, A-62). A plain cancel is refused, and only one's own
     * waitlisted Application can be withdrawn.
     */
    @Test
    void waitlistedStudentWithdraws() throws Exception {
        StayFlow.Applied offered = waitlisted(37);
        String manager = bearer(mvc, MANAGER_A);
        stay.postJson("/round2/run", manager, "{\"termId\":%d}".formatted(stay.termId())).andExpect(status().isOk());
        StayFlow.Applied waiting = waitlisted(38);

        String path = "/applications/" + offered.applicationId();
        String detail = getAs(path, offered.auth())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Waitlisted"))
                .andExpect(jsonPath("$.canCancel").value(false))
                .andExpect(jsonPath("$.waitlist.offer.id").isString())
                .andExpect(jsonPath("$.waitlist.until").value("2031-01-02"))
                .andExpect(jsonPath("$.events[*].title", hasItem("Choose a Room from the Round 2 options")))
                .andReturn().getResponse().getContentAsString();
        long deposit = ((Number) JsonPath.read(detail, "$.waitlist.refund")).longValue();
        assertThat(deposit).isPositive();
        stay.postJson(path + "/cancel", offered.auth(), "{}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CANNOT_CANCEL"));

        mvc.perform(put("/students/me/refund-account")
                        .header(HttpHeaders.AUTHORIZATION, offered.auth()).contentType("application/json")
                        .content("{\"holder\":\"Ngo Thi Lan\",\"number\":\"0123 456 789\",\"bankCode\":\"970415\",\"accepted\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.number").value("0123456789"));
        stay.postJson(path + "/withdraw", waiting.auth(), "{}").andExpect(status().isNotFound());
        stay.postJson(path + "/withdraw", offered.auth(), "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.refund").value(deposit));
        assertThat(flow.statuses(offered.auth())).containsExactly("Cancelled");
        assertThat(jdbc.sql("""
                SELECT count(*) FROM app_round2_option o JOIN app_round2_offer f ON f.id = o.offer_id
                JOIN app_application a ON a.id = f.application_id WHERE a.code = :code AND (o.held OR f.status <> 'DECLINED')
                """).param("code", offered.applicationId()).query(Long.class).single()).isZero();
        assertThat(pendingRefunds(offered.applicationId())).isEqualTo(deposit);
        getAs("/refunds?status=Pending&pageSize=100&termId=" + stay.termId(), manager)
                .andExpect(jsonPath("$.items[?(@.account.number == '0123456789')].amount").value(hasItem((int) deposit)));
        stay.postJson(path + "/withdraw", offered.auth(), "{}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_WAITLISTED"));

        // Without an offer: waiting for a free Bed until check-in, or withdraw now.
        getAs("/applications/" + waiting.applicationId(), waiting.auth())
                .andExpect(jsonPath("$.waitlist.offer").value((Object) null))
                .andExpect(jsonPath("$.events[*].title", hasItem("Wait for a free Bed")));
        stay.postJson("/applications/" + waiting.applicationId() + "/withdraw", waiting.auth(), "{}")
                .andExpect(status().isOk());
        assertThat(pendingRefunds(waiting.applicationId())).isPositive();
    }

    /**
     * TC-APP-026: when the Term's check-in starts, a waitlisted Application without an open offer is cancelled with
     * the whole Deposit to refund and the student is told; one with an open offer keeps it until it is answered.
     */
    @Test
    void waitlistEndsWhenCheckInStarts() throws Exception {
        StayFlow.Applied waiting = waitlisted(39);
        assertThat(round2.endWaitlists()).isZero();
        jdbc.sql("UPDATE cfg_term SET check_in_start = CURRENT_DATE WHERE id = :t").param("t", stay.termId()).update();
        try {
            assertThat(round2.endWaitlists()).isGreaterThanOrEqualTo(1);
            assertThat(round2.endWaitlists()).isZero();
        } finally {
            jdbc.sql("UPDATE cfg_term SET check_in_start = DATE '2031-01-02' WHERE id = :t").param("t", stay.termId())
                    .update();
        }
        assertThat(flow.statuses(waiting.auth())).containsExactly("Cancelled");
        assertThat(pendingRefunds(waiting.applicationId())).isPositive();
        getAs("/notifications", waiting.auth())
                .andExpect(jsonPath("$.items[*].title", hasItem("Your Application is cancelled")));
    }

    /**
     * TC-APP-024: a Manager runs Round 2 (M8): the Waitlisted students without an open offer get held options on the
     * Term's free Beds, by the rules of the offers made when a Block is approved; students may not run it. The
     * Manager's list shows who is waiting without an offer, then who got one with its options (A-58).
     */
    @Test
    void managerRunsRound2() throws Exception {
        List<StayFlow.Applied> applied = stay.runRound1("6-bed", "Premium", 18, 19);
        // As if the first offers had found no Bed: the students wait without an offer.
        jdbc.sql("UPDATE app_round2_option SET held = FALSE WHERE held").update();
        jdbc.sql("UPDATE app_round2_offer SET status = 'WITHDRAWN' WHERE status = 'PENDING'").update();
        String manager = bearer(mvc, MANAGER_A);
        getAs("/round2?termId=" + stay.termId(), manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.waitlisted").value(2))
                .andExpect(jsonPath("$.openOffers").value(0))
                .andExpect(jsonPath("$.freeBeds").isNumber());
        getAs("/round2/offers?status=No offer&termId=" + stay.termId(), manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counts.noOffer").value(2))
                .andExpect(jsonPath("$.items[*].applicationId", hasItem(applied.getFirst().applicationId())))
                .andExpect(jsonPath("$.items[0].status").value("No offer"))
                .andExpect(jsonPath("$.items[0].options.length()").value(0));
        getAs("/round2/offers?status=Lost&termId=" + stay.termId(), manager)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.status").isString());
        getAs("/round2/offers?termId=" + stay.termId(), applied.getFirst().auth()).andExpect(status().isForbidden());
        stay.postJson("/round2/run", applied.getFirst().auth(), "{\"termId\":%d}".formatted(stay.termId()))
                .andExpect(status().isForbidden());
        stay.postJson("/round2/run", manager, "{\"termId\":%d}".formatted(stay.termId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.offered").value(2))
                .andExpect(jsonPath("$.waitlisted").value(0));
        for (StayFlow.Applied a : applied) {
            getAs("/students/me/round2-offer", a.auth()).andExpect(jsonPath("$.offer.options[0].id").isString());
        }
        getAs("/round2?termId=" + stay.termId(), manager)
                .andExpect(jsonPath("$.waitlisted").value(0))
                .andExpect(jsonPath("$.openOffers").value(2));
        getAs("/round2/offers?status=Pending&termId=" + stay.termId(), manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.counts.pending").value(2))
                .andExpect(jsonPath("$.counts.noOffer").value(0))
                .andExpect(jsonPath("$.counts.withdrawn").isNumber())
                .andExpect(jsonPath("$.items[0].studentCode", startsWith("SE19")))
                .andExpect(jsonPath("$.items[0].expiresAt").isString())
                .andExpect(jsonPath("$.items[0].options[0].block").value("A"))
                .andExpect(jsonPath("$.items[0].options[0].chosen").value(false));
    }
}
