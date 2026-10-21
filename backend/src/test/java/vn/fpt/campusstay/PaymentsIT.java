package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.nio.charset.StandardCharsets;

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

/** Student Invoices, the VietQR payment page, the SePay webhook and receipts (TC-BIL-NNN). */
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
                .andReturn().getResponse().getContentAsString();
        String expires = JsonPath.read(page, "$.qr.expiresAt");
        Thread.sleep(5);
        mvc.perform(post("/invoices/" + app.depositInvoiceId() + "/payment/refresh").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.qr.image").isString())
                .andExpect(jsonPath("$.qr.expiresAt").value(not(expires)));
    }

    /** TC-BIL-002 (security): the webhook refuses a missing or wrong API key. */
    @Test
    void webhookNeedsApiKey() throws Exception {
        long id = ApplyFlow.nextTxn();
        String body = ApplyFlow.sepay(id, "CSTAY000001", "CK CSTAY000001", 1000);
        mvc.perform(post("/webhooks/sepay").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/webhooks/sepay").header(HttpHeaders.AUTHORIZATION, "Apikey wrong")
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        assertThat(jdbc.sql("SELECT count(*) FROM bil_bank_transaction WHERE provider_txn_id = :id")
                .param("id", String.valueOf(id)).query(Long.class).single()).isZero();
    }

    /**
     * TC-BIL-003 (business rule): an exact transfer pays the Invoice once, even when SePay delivers it twice;
     * the Application is submitted and a PDF receipt is available.
     */
    @Test
    void exactTransferPaysOnce() throws Exception {
        String auth = bearer(mvc, student(31));
        ApplyFlow.Applied app = flow.apply(auth, "4-bed", "Premium", null);
        String transfer = transferContent(app.depositInvoiceId());
        String body = ApplyFlow.sepay(ApplyFlow.nextTxn(), transfer, "SE190031 " + transfer + " ky tuc xa", 1_560_000);
        flow.webhook(body).andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true));
        flow.webhook(body).andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true));

        assertThat(jdbc.sql("SELECT count(*) FROM bil_payment p JOIN bil_invoice i ON i.id = p.invoice_id WHERE i.code = :code")
                .param("code", app.depositInvoiceId()).query(Long.class).single()).isEqualTo(1);
        mvc.perform(get("/invoices/" + app.depositInvoiceId() + "/payment").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.invoice.status").value("Paid"))
                .andExpect(jsonPath("$.invoice.paidAt").value("2026-10-21T03:15:00Z"))
                .andExpect(jsonPath("$.qr").value((Object) null));
        mvc.perform(get("/students/me/invoices").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.items[0].paymentMethod").value("VietQR"))
                .andExpect(jsonPath("$.summary.paidTotal").value(1_560_000))
                .andExpect(jsonPath("$.summary.outstanding").value(0));
        assertThat(flow.statuses(auth)).containsExactly("Submitted");
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.items[*].title", hasItem("Payment received")));

        byte[] pdf = mvc.perform(get("/invoices/" + app.depositInvoiceId() + "/receipt").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        containsString("receipt-" + app.depositInvoiceId() + ".pdf")))
                .andReturn().getResponse().getContentAsByteArray();
        String text = new String(pdf, StandardCharsets.ISO_8859_1);
        assertThat(text).startsWith("%PDF-1.4").contains(app.depositInvoiceId()).contains("1,560,000 VND").endsWith("%%EOF\n");
    }

    /** TC-BIL-004: a wrong amount does not pay the Invoice; it waits for Staff confirmation. */
    @Test
    void wrongAmountWaitsForConfirmation() throws Exception {
        String auth = bearer(mvc, student(32));
        ApplyFlow.Applied app = flow.apply(auth, "6-bed", "Standard", null);
        String transfer = transferContent(app.depositInvoiceId());
        flow.webhook(ApplyFlow.sepay(ApplyFlow.nextTxn(), null, "chuyen tien " + transfer.toLowerCase(), 1000))
                .andExpect(status().isOk());
        mvc.perform(get("/invoices/" + app.depositInvoiceId()).header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.status").value("Awaiting confirmation"));
        assertThat(jdbc.sql("SELECT match_status FROM bil_bank_transaction WHERE amount = 1000 AND content LIKE :c")
                .param("c", "%" + transfer.toLowerCase() + "%").query(String.class).single()).isEqualTo("AMOUNT_MISMATCH");
        assertThat(flow.statuses(auth)).containsExactly("Awaiting Deposit");
        mvc.perform(get("/invoices/" + app.depositInvoiceId() + "/receipt").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_PAID"));
    }

    /** TC-BIL-005: the code found in the transfer memo when SePay sends none; unknown codes stay unmatched. */
    @Test
    void codeInMemoAndUnmatchedTransfers() throws Exception {
        String auth = bearer(mvc, student(33));
        ApplyFlow.Applied app = flow.apply(auth, "4-bed", "Basic", null);
        String transfer = transferContent(app.depositInvoiceId());
        flow.webhook(ApplyFlow.sepay(ApplyFlow.nextTxn(), null, "MBVCB.123 " + transfer + " SE190033", 1_200_000))
                .andExpect(status().isOk());
        mvc.perform(get("/invoices/" + app.depositInvoiceId()).header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.status").value("Paid"));
        long id = ApplyFlow.nextTxn();
        flow.webhook(ApplyFlow.sepay(id, null, "tien nha thang 10", 500_000)).andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT match_status FROM bil_bank_transaction WHERE provider_txn_id = :id")
                .param("id", String.valueOf(id)).query(String.class).single()).isEqualTo("UNMATCHED");
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
    }

    private String transferContent(String invoiceCode) {
        return jdbc.sql("SELECT transfer_content FROM bil_invoice WHERE code = :code").param("code", invoiceCode)
                .query(String.class).single();
    }
}
