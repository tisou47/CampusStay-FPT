package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.bil.internal.FinanceService;

/** Block Finance: overdue Invoices and reminders, figures, refunds (TC-BIL-020, 021). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class FinanceIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    FinanceService finance;

    StayFlow stay;
    long termId;

    @BeforeEach
    void openTerm() {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        termId = flow.openTerm();
        stay = new StayFlow(mvc, jdbc, flow, termId);
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path + (path.contains("?") ? "&" : "?") + "termId=" + termId)
                .header(HttpHeaders.AUTHORIZATION, auth));
    }

    /**
     * TC-BIL-020: an unpaid Balance past its due date becomes Overdue (the student is told); the Block Manager
     * sees it with the days overdue and sends a reminder, in-app and by email.
     */
    @Test
    void overdueAndReminders() throws Exception {
        String auth = stay.runRound1("2-bed", "Standard", 20).getFirst().auth();
        String balance = JsonPath.read(mvc.perform(get("/students/me/allocation?termId=" + termId)
                .header(HttpHeaders.AUTHORIZATION, auth)).andReturn().getResponse().getContentAsString(),
                "$.balance.invoiceId");
        jdbc.sql("UPDATE bil_invoice SET due_at = now() - interval '3 days' WHERE code = :code").param("code", balance)
                .update();
        assertThat(finance.markOverdue()).isEqualTo(1);
        mvc.perform(get("/invoices/" + balance).header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.status").value("Overdue"));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.items[0].title").value("Invoice overdue"));

        String manager = bearer(mvc, MANAGER_A);
        getAs("/finance/overdue", manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].invoiceId").value(balance))
                .andExpect(jsonPath("$.items[0].studentCode").value("SE190020"))
                .andExpect(jsonPath("$.items[0].typeLabel").value("Balance"))
                .andExpect(jsonPath("$.items[0].daysOverdue").value(3))
                .andExpect(jsonPath("$.items[0].remindedAt").value((Object) null));
        getAs("/finance/overdue", bearer(mvc, MANAGER_B))
                .andExpect(jsonPath("$.items[*].invoiceId", not(hasItem(balance))));
        stay.postJson("/finance/reminders", bearer(mvc, STAFF_A), "{\"invoiceIds\":[\"%s\"]}".formatted(balance))
                .andExpect(status().isForbidden());
        stay.postJson("/finance/reminders", manager, "{\"invoiceIds\":[\"%s\",\"INV-NONE-000001\"]}".formatted(balance))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sent").value(1));
        getAs("/finance/overdue", manager).andExpect(jsonPath("$.items[0].remindedAt").isString());
        assertThat(jdbc.sql("SELECT count(*) FROM ntf_email_outbox WHERE subject LIKE 'Payment reminder:%'")
                .query(Long.class).single()).isEqualTo(1);

        getAs("/finance/summary", manager)
                .andExpect(jsonPath("$.overdueCount").value(1))
                .andExpect(jsonPath("$.invoices", greaterThanOrEqualTo(2)))
                .andExpect(jsonPath("$.collected", greaterThanOrEqualTo(1)));
        getAs("/invoices", manager).andExpect(jsonPath("$.items[*].id", hasItem(balance)));
    }

    /** TC-BIL-021: refunds wait for the Block Manager; rejecting needs a note; the student is told. */
    @Test
    void refundDecisions() throws Exception {
        long refund = jdbc.sql("""
                INSERT INTO bil_refund (term_id, student_id, building_id, source_type, source_id, reason, paid_amount,
                                        amount, status, student_name, student_code, gender)
                SELECT :term, u.id, b.id, 'CHECK_OUT', 0, 'Utility Deposit settlement · Room A-301', 600000, 300000,
                       'PENDING', u.display_name, s.student_code, s.gender
                FROM auth_user u JOIN auth_student s ON s.user_id = u.id, inv_building b
                WHERE u.email = :email AND b.code = 'A'
                RETURNING id
                """).param("term", termId).param("email", student(21)).query(Long.class).single();
        String id = String.valueOf(refund);
        String manager = bearer(mvc, MANAGER_A);
        getAs("/refunds?status=Pending", manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].studentCode").value("SE190021"))
                .andExpect(jsonPath("$.items[0].rule").value("Check-out"))
                .andExpect(jsonPath("$.items[0].paid").value(600_000))
                .andExpect(jsonPath("$.items[0].amount").value(300_000))
                .andExpect(jsonPath("$.items[0].status").value("Pending"));
        getAs("/refunds", bearer(mvc, MANAGER_B)).andExpect(jsonPath("$.items[*].id", not(hasItem(id))));
        getAs("/finance/summary", manager)
                .andExpect(jsonPath("$.refundsPendingCount").value(1))
                .andExpect(jsonPath("$.refundsPendingAmount").value(300_000));

        stay.postJson("/refunds/" + id + "/decision", bearer(mvc, STAFF_A), "{\"decision\":\"Approved\"}")
                .andExpect(status().isForbidden());
        stay.postJson("/refunds/" + id + "/decision", manager, "{\"decision\":\"Rejected\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.note").isString());
        stay.postJson("/refunds/" + id + "/decision", manager, "{\"decision\":\"Approved\"}")
                .andExpect(status().isNoContent());
        stay.postJson("/refunds/" + id + "/decision", manager, "{\"decision\":\"Approved\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_DECIDED"));
        getAs("/refunds?status=Approved", manager).andExpect(jsonPath("$.items[*].id", hasItem(id)));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, bearer(mvc, student(21))))
                .andExpect(jsonPath("$.items[0].title").value("Refund decision"));
    }
}
