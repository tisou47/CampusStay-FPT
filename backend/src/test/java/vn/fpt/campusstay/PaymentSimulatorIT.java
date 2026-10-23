package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.bearer;

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

/** The payment simulator of demo servers (A-08), switched on with campusstay.payment.simulator (TC-BIL-027). */
@SpringBootTest(properties = "campusstay.payment.simulator=true")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PaymentSimulatorIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    /** TC-BIL-027: only the Invoice's student (or an Admin) may simulate; the Deposit is then paid by VietQR. */
    @Test
    void simulatedTransferPaysTheDeposit() throws Exception {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        flow.openTerm();
        String auth = bearer(mvc, StayFlow.student(40));
        ApplyFlow.Applied app = flow.apply(auth, "4-bed", "Basic", null);

        mvc.perform(post("/dev/invoices/" + app.depositInvoiceId() + "/simulate-payment")
                .header(HttpHeaders.AUTHORIZATION, bearer(mvc, StayFlow.student(41))))
                .andExpect(status().isNotFound());
        mvc.perform(post("/dev/invoices/" + app.depositInvoiceId() + "/simulate-payment")
                .header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isNoContent());

        mvc.perform(get("/invoices/" + app.depositInvoiceId() + "/payment").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.invoice.status").value("Paid"));
        mvc.perform(get("/students/me/invoices").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.items[0].paymentMethod").value("VietQR"));
        assertThat(flow.statuses(auth)).containsExactly("Submitted");
    }
}
