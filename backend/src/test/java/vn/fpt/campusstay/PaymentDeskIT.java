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

    private ResultActions confirm(String invoice, String auth, String amount, String reference, MockMultipartFile receipt)
            throws Exception {
        var request = multipart("/payments/" + invoice + "/confirm").header(HttpHeaders.AUTHORIZATION, auth);
        if (amount != null) {
            request.param("amount", amount);
        }
        if (reference != null) {
            request.param("reference", reference);
        }
        if (receipt != null) {
            request.file(receipt);
        }
        return mvc.perform(request);
    }

    /** TC-BIL-010: the Block's Invoices with filters and the summary; another Block's Manager does not see them. */
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
        getAs("/payments?method=VietQR&q=SE190031", manager)
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].status").value("Paid"))
                .andExpect(jsonPath("$.items[0].method").value("VietQR"))
                .andExpect(jsonPath("$.items[0].reference").isString());
        getAs("/payments?date=month", manager)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.date").isString());

        getAs("/payments", bearer(mvc, MANAGER_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].invoiceId", not(hasItem(unpaid.depositInvoiceId()))));
        getAs("/payments?block=B", bearer(mvc, MANAGER_A))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));
        getAs("/invoices/" + unpaid.depositInvoiceId(), manager).andExpect(status().isOk());
        getAs("/invoices/" + unpaid.depositInvoiceId(), bearer(mvc, MANAGER_A)).andExpect(status().isNotFound());
        getAs("/payments", payer).andExpect(status().isForbidden());
    }

    /**
     * TC-BIL-011: Staff confirm a transfer by hand with the bank reference and a receipt; the amount must be
     * exact; the Application is submitted as with VietQR; a second confirmation is refused.
     */
    @Test
    void manualConfirmation() throws Exception {
        String auth = bearer(mvc, student(32));
        ApplyFlow.Applied app = flow.apply(auth, "2-bed", "Standard", "{\"mode\":\"auto\"}");
        String invoice = app.depositInvoiceId();
        String manager = bearer(mvc, MANAGER_B);
        MockMultipartFile receipt = new MockMultipartFile("receipt", "transfer.png", "image/png", PNG);

        confirm(invoice, manager, "100", null, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.amount").isString())
                .andExpect(jsonPath("$.details.fields.reference").isString());
        confirm(invoice, bearer(mvc, MANAGER_A), "2070000", "FT26294001", null).andExpect(status().isNotFound());
        confirm(invoice, auth, "2070000", "FT26294001", null).andExpect(status().isForbidden());

        confirm(invoice, manager, "2070000", "FT26294001", receipt).andExpect(status().isNoContent());
        assertThat(flow.statuses(auth)).containsExactly("Submitted");
        String list = getAs("/payments?q=SE190032", manager)
                .andExpect(jsonPath("$.items[0].status").value("Paid"))
                .andExpect(jsonPath("$.items[0].method").value("Manual transfer"))
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
        getAs("/payments/" + invoice + "/receipt-file", bearer(mvc, MANAGER_A)).andExpect(status().isNotFound());
        getAs("/notifications", auth).andExpect(jsonPath("$.items[*].title", hasItem("Payment received")));

        confirm(invoice, manager, "2070000", "FT26294002", null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PAID"));
        assertThat(jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE action = 'PAYMENT_CONFIRMED_MANUALLY'")
                .query(Long.class).single()).isEqualTo(1);
    }

    /** TC-BIL-012: with manual confirmation turned off (Admin › Fees) only VietQR settles Invoices; files are sniffed. */
    @Test
    void manualConfirmationRules() throws Exception {
        String auth = bearer(mvc, student(33));
        String invoice = flow.apply(auth, "2-bed", "Standard", "{\"mode\":\"auto\"}").depositInvoiceId();
        String manager = bearer(mvc, MANAGER_B);

        MockMultipartFile fake = new MockMultipartFile("receipt", "transfer.png", "image/png",
                "not an image".getBytes(StandardCharsets.UTF_8));
        confirm(invoice, manager, "2070000", "FT26294003", fake)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("FILE_TYPE_NOT_ALLOWED"));

        jdbc.sql("UPDATE cfg_fee_policy SET allow_manual_confirm = FALSE WHERE id = 1").update();
        try {
            confirm(invoice, manager, "2070000", "FT26294003", null)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("MANUAL_CONFIRM_OFF"));
        } finally {
            jdbc.sql("UPDATE cfg_fee_policy SET allow_manual_confirm = TRUE WHERE id = 1").update();
        }
        assertThat(flow.statuses(auth)).containsExactly("Awaiting Deposit");
    }
}
