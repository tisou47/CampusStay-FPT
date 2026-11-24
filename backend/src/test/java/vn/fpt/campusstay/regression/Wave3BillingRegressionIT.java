package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;

/**
 * Wave 3 business findings on money: BE-3RD-10 (custom refund rules apply), BE-APP-BIL-08, -10, -12, -18, -19.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class Wave3BillingRegressionIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    RegressionSupport r;

    @BeforeEach
    void setUp() {
        r = new RegressionSupport(mvc, jdbc);
    }

    /** A pending refund of a Block A student of {@code paid} VND, with the rule of the trigger (null = none). */
    private long refund(int n, String sourceType, String ruleTrigger, long paid) {
        return jdbc.sql("""
                INSERT INTO bil_refund (term_id, student_id, building_id, source_type, source_id, reason, rule_id,
                                        paid_amount, amount, status, student_name, student_code, gender)
                SELECT :term, u.id, b.id, :src, 0, 'Test refund',
                       (SELECT id FROM cfg_refund_rule WHERE trigger_code = :rule LIMIT 1),
                       :paid, :paid, 'PENDING', u.display_name, s.student_code, s.gender
                FROM auth_user u JOIN auth_student s ON s.user_id = u.id, inv_building b
                WHERE u.email = :email AND b.code = 'A'
                RETURNING id
                """).param("term", r.termId).param("src", sourceType).param("rule", ruleTrigger).param("paid", paid)
                .param("email", RegressionSupport.student(n)).query(Long.class).single();
    }

    private long customRule(int percent, boolean active) {
        return jdbc.sql("""
                INSERT INTO cfg_refund_rule (trigger_code, description, refund_percent, approver_role, active, sort_order)
                VALUES ('CUSTOM', 'Medical withdrawal ' || :p, :p, 'MANAGER', :active, 99) RETURNING id
                """).param("p", percent).param("active", active).query(Long.class).single();
    }

    private void bankAccount(int n) throws Exception {
        mvc.perform(put("/students/me/refund-account").header(HttpHeaders.AUTHORIZATION, r.bearer(RegressionSupport.student(n)))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"holder\":\"Ngo Van Ba\",\"number\":\"0123 456 789\",\"bankCode\":\"970415\",\"accepted\":true}"))
                .andExpect(status().isOk());
    }

    /**
     * TC-BIL-400 (BE-3RD-10): a Manager applies an Admin's custom 80 % rule when approving a refund of 1,000,000:
     * the refund becomes 800,000 under that rule, and the choice is audited.
     */
    @Test
    void customRefundRuleApplies() throws Exception {
        long rule = customRule(80, true);
        long id = refund(1, "OTHER", null, 1_000_000);
        String list = RegressionSupport.body(r.getAs("/refunds?termId=" + r.termId, r.manager()).andExpect(status().isOk()));
        assertThat((List<String>) JsonPath.read(list, "$.ruleOptions[*].id")).contains(String.valueOf(rule));
        r.postJson("/refunds/" + id + "/decision", r.manager(),
                "{\"decision\":\"Approved\",\"ruleId\":\"" + rule + "\"}").andExpect(status().isNoContent());
        var row = jdbc.sql("SELECT amount, rule_id, status FROM bil_refund WHERE id = :id").param("id", id)
                .query((rs, i) -> List.of(rs.getLong(1), rs.getLong(2), rs.getString(3))).single();
        assertThat(row).containsExactly(800_000L, rule, "APPROVED");
        assertThat(r.count("SELECT count(*) FROM shared_audit_log WHERE action = 'REFUND_RULE_APPLIED' AND object_id = ?", String.valueOf(id)))
                .isEqualTo(1);
    }

    /** TC-BIL-401 (BE-3RD-10): a custom rule cannot replace the Utility Deposit settlement, nor an inactive rule. */
    @Test
    void customRuleRefusedForSettlementOrInactive() throws Exception {
        long active = customRule(70, true);
        long inactive = customRule(60, false);
        long settlement = refund(2, "CHECK_OUT", "UTILITY_DEPOSIT", 600_000);
        r.postJson("/refunds/" + settlement + "/decision", r.manager(),
                "{\"decision\":\"Approved\",\"ruleId\":\"" + active + "\"}").andExpect(status().isBadRequest());
        long other = refund(3, "OTHER", null, 500_000);
        r.postJson("/refunds/" + other + "/decision", r.manager(),
                "{\"decision\":\"Approved\",\"ruleId\":\"" + inactive + "\"}").andExpect(status().isBadRequest());
        assertThat(r.count("SELECT count(*) FROM bil_refund WHERE id IN (?, ?) AND status = 'PENDING'", settlement, other))
                .isEqualTo(2);
    }

    /** TC-BIL-402 (BE-3RD-10): adding a refund rule that is switched off announces nothing to the students. */
    @Test
    void inactiveRuleIsNotAnnounced() throws Exception {
        String admin = r.bearer(TestAuth.ADMIN);
        String fees = RegressionSupport.body(r.getAs("/admin/fees", admin).andExpect(status().isOk()));
        String withRule = fees.replaceFirst("\"rules\":\\[",
                "\"rules\":[{\"when\":\"Family emergency\",\"refundPercent\":50,\"approver\":\"Manager\",\"active\":false},");
        long before = r.count("SELECT count(*) FROM ntf_announcement");
        mvc.perform(put("/admin/fees").header(HttpHeaders.AUTHORIZATION, admin).contentType(MediaType.APPLICATION_JSON)
                .content(withRule)).andExpect(status().isOk());
        assertThat(r.count("SELECT count(*) FROM cfg_refund_rule WHERE description = 'Family emergency'")).isEqualTo(1);
        assertThat(r.count("SELECT count(*) FROM ntf_announcement")).isEqualTo(before);
    }

    /** TC-BIL-403 (BE-APP-BIL-08): a student leaving the waitlist gets a refund linked to the paid Deposit Invoice. */
    @Test
    void waitlistRefundIsLinkedToTheDeposit() throws Exception {
        RegressionSupport.Applied app = r.apply(4, "2-bed", "Basic");
        r.pay(app.auth(), app.depositInvoiceId());
        jdbc.sql("UPDATE app_application SET status = 'WAITLISTED' WHERE code = :c").param("c", app.id()).update();
        r.postJson("/applications/" + app.id() + "/withdraw", app.auth(), "{}").andExpect(status().isOk());
        assertThat(r.count("""
                SELECT count(*) FROM bil_refund f JOIN bil_invoice i ON i.id = f.invoice_id
                WHERE i.code = ? AND f.amount = i.amount
                """, app.depositInvoiceId())).isEqualTo(1);
    }

    /** TC-BIL-404 (BE-APP-BIL-10): a transfer claimed yesterday and confirmed today counts in "Collected today". */
    @Test
    void collectedTodayCountsConfirmations() throws Exception {
        RegressionSupport.Applied app = r.apply(5, "2-bed", "Basic");
        r.claim(app.auth(), app.depositInvoiceId()).andExpect(status().isOk());
        jdbc.sql("""
                UPDATE bil_payment_claim SET claimed_at = claimed_at - interval '2 days'
                WHERE invoice_id = (SELECT id FROM bil_invoice WHERE code = :c)
                """).param("c", app.depositInvoiceId()).update();
        String path = "/payments?termId=" + r.termId;
        int before = JsonPath.read(RegressionSupport.body(r.getAs(path, r.manager())), "$.summary.collectedTodayCount");
        r.confirm(app.depositInvoiceId()).andExpect(status().isOk());
        int after = JsonPath.read(RegressionSupport.body(r.getAs(path, r.manager())), "$.summary.collectedTodayCount");
        assertThat(after).isEqualTo(before + 1);
    }

    /** TC-BIL-405 (BE-APP-BIL-12): a Manager opening a student's payment page does not start the student's QR window. */
    @Test
    void backOfficeVisitDoesNotStartQrWindow() throws Exception {
        RegressionSupport.Applied app = r.apply(6, "2-bed", "Basic");
        jdbc.sql("UPDATE bil_invoice SET qr_expires_at = NULL WHERE code = :c").param("c", app.depositInvoiceId()).update();
        r.getAs("/invoices/" + app.depositInvoiceId() + "/payment", r.manager()).andExpect(status().isOk());
        r.postJson("/invoices/" + app.depositInvoiceId() + "/payment/refresh", r.manager(), "{}");
        assertThat(r.count("SELECT count(*) FROM bil_invoice WHERE code = ? AND qr_expires_at IS NULL",
                app.depositInvoiceId())).isEqualTo(1);
        r.getAs("/invoices/" + app.depositInvoiceId() + "/payment", app.auth()).andExpect(status().isOk());
        assertThat(r.count("SELECT count(*) FROM bil_invoice WHERE code = ? AND qr_expires_at IS NOT NULL",
                app.depositInvoiceId())).isEqualTo(1);
    }

    /**
     * TC-BIL-406 (BE-APP-BIL-19): after a rejected claim the student reads the reason, the rejections left and the new
     * deadline, and reminders start again for the new deadline.
     */
    @Test
    void rejectedClaimExplainsTheState() throws Exception {
        RegressionSupport.Applied app = r.apply(7, "2-bed", "Basic");
        jdbc.sql("UPDATE bil_invoice SET reminders_sent = 2 WHERE code = :c").param("c", app.depositInvoiceId()).update();
        r.claim(app.auth(), app.depositInvoiceId()).andExpect(status().isOk());
        r.postJson("/payment-claims/reject", r.manager(), "{\"invoiceIds\":[\"" + app.depositInvoiceId()
                + "\"],\"reason\":\"No transfer found\"}").andExpect(status().isOk());
        long limit = r.count("SELECT value::bigint FROM cfg_parameter WHERE key = 'payment.rejections_to_cancel'");
        String page = RegressionSupport.body(r.getAs("/invoices/" + app.depositInvoiceId() + "/payment", app.auth())
                .andExpect(status().isOk()));
        assertThat(((Number) JsonPath.read(page, "$.claim.rejectionsLeft")).longValue()).isEqualTo(limit - 1);
        assertThat((String) JsonPath.read(page, "$.claim.lastRejection.reason")).isEqualTo("No transfer found");
        assertThat((String) JsonPath.read(page, "$.claim.lastRejection.dueAt"))
                .isEqualTo(JsonPath.read(page, "$.invoice.dueAt"));
        assertThat(r.count("SELECT reminders_sent FROM bil_invoice WHERE code = ?", app.depositInvoiceId())).isZero();
    }

    /** TC-BIL-407 (BE-APP-BIL-18): the refund payment page gives a VietQR of the student's account, amount and REFUND-id. */
    @Test
    void refundPaymentQr() throws Exception {
        bankAccount(8);
        long id = refund(8, "OTHER", null, 450_000);
        String json = RegressionSupport.body(r.getAs("/refunds/" + id + "/payment", r.manager()).andExpect(status().isOk()));
        String image = JsonPath.read(json, "$.qr.image");
        assertThat(image).contains("acc=0123456789", "bank=970415", "amount=450000", "des=REFUND-" + id);
        assertThat((String) JsonPath.read(json, "$.content")).isEqualTo("REFUND-" + id);
        assertThat(r.getAs("/refunds/" + id + "/payment", r.bearer(TestAuth.STAFF_A)).andReturn().getResponse()
                .getStatus()).isEqualTo(403);
    }

    /** TC-BIL-408 (BE-APP-BIL-18): without a bank account the refund payment page answers 409 NO_REFUND_ACCOUNT. */
    @Test
    void refundPaymentWithoutAccount() throws Exception {
        long id = refund(9, "OTHER", null, 300_000);
        var res = r.getAs("/refunds/" + id + "/payment", r.manager()).andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(409);
        assertThat(res.getContentAsString()).contains("NO_REFUND_ACCOUNT");
    }
}
