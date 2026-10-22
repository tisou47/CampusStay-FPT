package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

/** Round 2 for Waitlisted students: held options, accept, decline and expiry (TC-APP-020, 021). */
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
        getAs("/notifications", accepts.auth()).andExpect(jsonPath("$.items[*].title", hasItem("New room options")));

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
}
