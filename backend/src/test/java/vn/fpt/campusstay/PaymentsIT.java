package vn.fpt.campusstay;

import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
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

/** Student Invoices, the payment page with its VietQR image and "I have transferred", and privacy (TC-BIL-001, 006). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PaymentsIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    ApplyFlow flow;

    @BeforeEach
    void openTerm() {
        flow = new ApplyFlow(mvc, jdbc);
        flow.openTerm();
    }

    private static String student(int n) {
        return "se19%04d@student.campusstay.test".formatted(n);
    }

    /** TC-BIL-001: the Deposit Invoice in the list, its detail and the VietQR payment page; the QR can be refreshed. */
    @Test
    void depositInvoiceAndPaymentPage() throws Exception {
        String auth = bearer(mvc, student(30));
        ApplyFlow.Applied app = flow.apply(auth, "2-bed", "Standard", "{\"mode\":\"auto\"}");
        mvc.perform(get("/students/me/invoices").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(app.depositInvoiceId()))
                .andExpect(jsonPath("$.items[0].type").value("deposit"))
                .andExpect(jsonPath("$.items[0].typeLabel").value("Deposit"))
                .andExpect(jsonPath("$.items[0].termName").value(ApplyFlow.TERM_NAME))
                .andExpect(jsonPath("$.items[0].amount").value(2_070_000))
                .andExpect(jsonPath("$.items[0].status").value("Unpaid"))
                .andExpect(jsonPath("$.items[0].transferContent", startsWith("CSTAY")))
                .andExpect(jsonPath("$.summary.outstanding").value(2_070_000))
                .andExpect(jsonPath("$.summary.dueCount").value(1))
                .andExpect(jsonPath("$.summary.paidTotal").value(0));
        mvc.perform(get("/invoices/" + app.depositInvoiceId()).header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title", startsWith("Deposit")))
                .andExpect(jsonPath("$.lines[0].label").value("Deposit 20% of the Term price 10,350,000 VND"))
                .andExpect(jsonPath("$.lines[0].amount").value(2_070_000))
                .andExpect(jsonPath("$.breakdown").value((Object) null));
        String page = mvc.perform(get("/invoices/" + app.depositInvoiceId() + "/payment").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.invoice.id").value(app.depositInvoiceId()))
                .andExpect(jsonPath("$.invoice.reference").value("Application " + app.id()))
                .andExpect(jsonPath("$.qr.image", startsWith("https://qr.sepay.vn/img?acc=0000000000&bank=MBBank&amount=2070000&des=CSTAY")))
                .andExpect(jsonPath("$.qr.expiresAt").isString())
                .andExpect(jsonPath("$.bank.name").value("MB Bank"))
                .andExpect(jsonPath("$.transferContent", startsWith("CSTAY")))
                .andExpect(jsonPath("$.canClaim").value(true))
                .andExpect(jsonPath("$.claim").value((Object) null))
                .andReturn().getResponse().getContentAsString();
        String expires = JsonPath.read(page, "$.qr.expiresAt");
        Thread.sleep(5);
        mvc.perform(post("/invoices/" + app.depositInvoiceId() + "/payment/refresh").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.qr.image").isString())
                .andExpect(jsonPath("$.qr.expiresAt").value(not(expires)));
    }

    /** TC-BIL-006 (permission): another student's Invoice is 404; the Admin may read it. */
    @Test
    void invoicesArePrivate() throws Exception {
        String owner = bearer(mvc, student(34));
        ApplyFlow.Applied app = flow.apply(owner, "4-bed", "Basic", null);
        mvc.perform(get("/invoices/" + app.depositInvoiceId()).header(HttpHeaders.AUTHORIZATION, bearer(mvc, student(35))))
                .andExpect(status().isNotFound());
        mvc.perform(get("/invoices/" + app.depositInvoiceId() + "/payment")
                .header(HttpHeaders.AUTHORIZATION, bearer(mvc, student(35))))
                .andExpect(status().isNotFound());
        mvc.perform(get("/invoices/" + app.depositInvoiceId()).header(HttpHeaders.AUTHORIZATION, bearer(mvc, ADMIN)))
                .andExpect(status().isOk());
        mvc.perform(get("/students/me/invoices").header(HttpHeaders.AUTHORIZATION, bearer(mvc, student(35))))
                .andExpect(jsonPath("$.total").value(0));
        flow.claim(bearer(mvc, student(35)), app.depositInvoiceId()).andExpect(status().isNotFound());
    }

}
