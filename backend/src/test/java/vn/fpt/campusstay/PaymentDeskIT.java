package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
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
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Staff › Payments: the scoped list with its summary and manual confirmation (TC-BIL-010…012). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PaymentDeskIT {

    private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H',
            'D', 'R' };

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

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    private ResultActions confirm(String invoice, String auth, String reference, MockMultipartFile receipt)
            throws Exception {
        var request = multipart("/payments/" + invoice + "/confirm").header(HttpHeaders.AUTHORIZATION, auth);
        if (reference != null) {
            request.param("reference", reference);
        }
        if (receipt != null) {
            request.file(receipt);
        }
        return mvc.perform(request);
    }

    /** TC-BIL-010: Invoices with filters and the summary; every Manager sees every Block, Staff do not (ADR-19). */
    @Test
    void scopedListWithSummary() throws Exception {
        String manager = bearer(mvc, MANAGER_B);
        String before = getAs("/payments", manager).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        ApplyFlow.Applied unpaid = flow.apply(bearer(mvc, student(30)), "2-bed", "Standard", "{\"mode\":\"auto\"}");
        String payer = bearer(mvc, student(31));
        ApplyFlow.Applied paid = flow.apply(payer, "2-bed", "Standard", "{\"mode\":\"auto\"}");
        flow.pay(payer, paid.depositInvoiceId());

        String after = getAs("/payments", manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].invoiceId", hasItem(unpaid.depositInvoiceId())))
                .andExpect(jsonPath("$.items[*].invoiceId", hasItem(paid.depositInvoiceId())))
                .andReturn().getResponse().getContentAsString();
        for (String field : new String[] { "total", "summary.depositsSubmitted", "summary.depositsPaid",
                "summary.unpaidDeposits", "summary.awaitingConfirmation" }) {
            int change = (int) JsonPath.read(after, "$." + field) - (int) JsonPath.read(before, "$." + field);
            assertThat(change).as(field).isEqualTo(switch (field) {
                case "total", "summary.depositsSubmitted" -> 2;
                case "summary.awaitingConfirmation" -> 0;
                default -> 1;
            });
        }
        getAs("/payments?status=Unpaid&type=deposit&q=SE190030", manager)
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].invoiceId").value(unpaid.depositInvoiceId()))
                .andExpect(jsonPath("$.items[0].studentCode").value("SE190030"))
                .andExpect(jsonPath("$.items[0].typeLabel").value("Deposit"))
                .andExpect(jsonPath("$.items[0].amount").value(2_070_000))
                .andExpect(jsonPath("$.items[0].method").value((Object) null))
                .andExpect(jsonPath("$.items[0].receipt").value((Object) null));
        getAs("/payments?method=Bank transfer&q=SE190031", manager)
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].status").value("Paid"))
                .andExpect(jsonPath("$.items[0].method").value("Bank transfer"));
        getAs("/payments?date=month", manager)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.date").isString());

        getAs("/payments?pageSize=100", bearer(mvc, MANAGER_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].invoiceId", hasItem(unpaid.depositInvoiceId())));
        getAs("/payments?block=B", bearer(mvc, MANAGER_A)).andExpect(status().isOk());
        getAs("/invoices/" + unpaid.depositInvoiceId(), manager).andExpect(status().isOk());
        getAs("/invoices/" + unpaid.depositInvoiceId(), bearer(mvc, MANAGER_A)).andExpect(status().isOk());
        getAs("/payments", bearer(mvc, TestAuth.STAFF_A)).andExpect(status().isForbidden());
        getAs("/payments", payer).andExpect(status().isForbidden());
    }

    /**
     * TC-BIL-011: a Manager confirms one Invoice with the bank reference and its receipt (required, R-23), even a transfer the student
     * did not claim (the claim is recorded in the Manager's name); the Application is submitted; a second
     * confirmation is refused; Staff and students may not confirm (ADR-19, ADR-22).
     */
    @Test
    void manualConfirmation() throws Exception {
        String auth = bearer(mvc, student(32));
        ApplyFlow.Applied app = flow.apply(auth, "2-bed", "Standard", "{\"mode\":\"auto\"}");
        String invoice = app.depositInvoiceId();
        String manager = bearer(mvc, MANAGER_B);
        MockMultipartFile receipt = new MockMultipartFile("receipt", "transfer.png", "image/png", PNG);

        confirm(invoice, manager, "x".repeat(61), null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.reference").isString());
        confirm(invoice, bearer(mvc, TestAuth.STAFF_A), "FT26294001", null).andExpect(status().isForbidden());
        confirm(invoice, auth, "FT26294001", null).andExpect(status().isForbidden());
        confirm(invoice, manager, "FT26294001", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.receipt").isString());

        confirm(invoice, manager, "FT26294001", receipt).andExpect(status().isNoContent());
        assertThat(flow.statuses(auth)).containsExactly("Submitted");
        String list = getAs("/payments?q=SE190032", manager)
                .andExpect(jsonPath("$.items[0].status").value("Paid"))
                .andExpect(jsonPath("$.items[0].method").value("Bank transfer"))
                .andExpect(jsonPath("$.items[0].reference").value("FT26294001"))
                .andExpect(jsonPath("$.items[0].paidAt").isString())
                .andExpect(jsonPath("$.items[0].receipt.name").value("transfer.png"))
                .andExpect(jsonPath("$.items[0].receipt.size").value(PNG.length))
                .andExpect(jsonPath("$.items[0].receipt.url", startsWith("http://localhost/files/")))
                .andExpect(jsonPath("$.summary.collectedTodayCount").value(1))
                .andExpect(jsonPath("$.summary.collectedToday").value(2_070_000))
                .andReturn().getResponse().getContentAsString();
        // The signed link opens without the bearer token (a plain link in the browser).
        String link = ((String) JsonPath.read(list, "$.items[0].receipt.url")).substring("http://localhost".length());
        mvc.perform(get(link)).andExpect(status().isOk()).andExpect(content().bytes(PNG));
        getAs("/payments/" + invoice + "/receipt-file", manager)
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/png"))
                .andExpect(content().bytes(PNG));
        getAs("/payments/" + invoice + "/receipt-file", bearer(mvc, TestAuth.STAFF_A)).andExpect(status().isForbidden());
        getAs("/notifications", auth).andExpect(jsonPath("$.items[*].title", hasItem("Payment received")));

        confirm(invoice, manager, "FT26294002", null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PAID"));
        assertThat(jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE action = 'PAYMENT_CONFIRMED' AND object_label = :code")
                .param("code", invoice).query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_payment_claim c JOIN bil_invoice i ON i.id = c.invoice_id
                WHERE i.code = :code AND c.status = 'CONFIRMED' AND c.claimed_by = c.decided_by
                """).param("code", invoice).query(Long.class).single()).isEqualTo(1);
    }

    /** TC-BIL-012: receipt files are sniffed; a void Invoice (its Application cancelled) cannot be confirmed. */
    @Test
    void manualConfirmationRules() throws Exception {
        String auth = bearer(mvc, student(33));
        ApplyFlow.Applied app = flow.apply(auth, "2-bed", "Standard", "{\"mode\":\"auto\"}");
        String invoice = app.depositInvoiceId();
        String manager = bearer(mvc, MANAGER_B);

        MockMultipartFile fake = new MockMultipartFile("receipt", "transfer.png", "image/png",
                "not an image".getBytes(StandardCharsets.UTF_8));
        confirm(invoice, manager, "FT26294003", fake)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("FILE_TYPE_NOT_ALLOWED"));
        assertThat(flow.statuses(auth)).containsExactly("Awaiting Deposit");

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/applications/" + app.id() + "/cancel").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isNoContent());
        confirm(invoice, manager, "FT26294003", null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVOICE_NOT_PAYABLE"));
    }
}
