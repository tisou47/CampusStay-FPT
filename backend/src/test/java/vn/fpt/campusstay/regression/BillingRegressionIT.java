package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Set;

import com.jayway.jsonpath.JsonPath;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.StudentNotEnrolled;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.Role;

/** Review findings BE-APP-BIL-01…06: regression tests (each reproduced the finding before Wave 1 fixed it). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BillingRegressionIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    ApplicationEventPublisher events;

    @Autowired
    TransactionTemplate tx;

    RegressionSupport r;

    @BeforeEach
    void setUp() {
        r = new RegressionSupport(mvc, jdbc);
    }

    /** A pending refund of a Block A student, with the given rule (null = no rule). */
    private String refund(int n, String sourceType, String ruleTrigger) {
        return String.valueOf(jdbc.sql("""
                INSERT INTO bil_refund (term_id, student_id, building_id, source_type, source_id, reason, rule_id,
                                        paid_amount, amount, status, student_name, student_code, gender)
                SELECT :term, u.id, b.id, :src, 0, 'Utility Deposit settlement',
                       (SELECT id FROM cfg_refund_rule WHERE trigger_code = :rule LIMIT 1),
                       600000, 300000, 'PENDING', u.display_name, s.student_code, s.gender
                FROM auth_user u JOIN auth_student s ON s.user_id = u.id, inv_building b
                WHERE u.email = :email AND b.code = 'A'
                RETURNING id
                """).param("term", r.termId).param("src", sourceType).param("rule", ruleTrigger)
                .param("email", RegressionSupport.student(n)).query(Long.class).single());
    }

    /** TC-BIL-041 (Wave 1 regression): BE-APP-BIL-01: Staff must not read Block Finance, Invoices or refunds (with students' bank accounts). */
    @Test
    void beAppBil01_staffCannotReadFinanceInvoicesOrRefunds() throws Exception {
        mvc.perform(put("/students/me/refund-account").header(HttpHeaders.AUTHORIZATION, r.bearer(RegressionSupport.student(3)))
                .contentType("application/json")
                .content("{\"holder\":\"Ngo Van Ba\",\"number\":\"0123 456 789\",\"bankCode\":\"970415\",\"accepted\":true}"))
                .andExpect(status().isOk());
        refund(3, "CHECK_OUT", null);
        String staff = r.bearer(TestAuth.STAFF_A);
        SoftAssertions soft = new SoftAssertions();
        for (String path : new String[] { "/finance/summary", "/finance/overdue", "/invoices", "/refunds" }) {
            var res = r.getAs(path + "?termId=" + r.termId, staff).andReturn().getResponse();
            soft.assertThat(res.getStatus()).as("Staff GET " + path + " → " + res.getContentAsString()
                    .substring(0, Math.min(300, res.getContentAsString().length()))).isEqualTo(403);
        }
        soft.assertAll();
    }

    /** TC-BIL-042 (Wave 1 regression): BE-APP-BIL-02: deciding refunds is Managers only (Permission.DECIDE_REFUNDS), also for a check-out refund. */
    @Test
    void beAppBil02_staffCannotDecideCheckOutRefund() throws Exception {
        String id = refund(4, "CHECK_OUT", "UTILITY_DEPOSIT");
        int status = r.postJson("/refunds/" + id + "/decision", r.bearer(TestAuth.STAFF_A), "{\"decision\":\"Approved\"}")
                .andReturn().getResponse().getStatus();
        assertThat(status).isEqualTo(403);
    }

    /** TC-BIL-043 (Wave 1 regression): BE-APP-BIL-03: after the transfer a Manager can mark an approved refund Paid. */
    @Test
    void beAppBil03_approvedRefundCanBeMarkedPaid() throws Exception {
        String id = refund(5, "CHECK_OUT", null);
        String manager = r.manager();
        r.postJson("/refunds/" + id + "/decision", manager, "{\"decision\":\"Approved\"}")
                .andExpect(status().isNoContent());
        int status = r.postJson("/refunds/" + id + "/paid", manager, "{\"reference\":\"FT2611210001\"}")
                .andReturn().getResponse().getStatus();
        assertThat(status).as("POST /refunds/{id}/paid").isBetween(200, 299);
        assertThat(jdbc.sql("SELECT status FROM bil_refund WHERE id = :id").param("id", Long.parseLong(id))
                .query(String.class).single()).isEqualTo("PAID");
    }

    /** TC-BIL-044 (Wave 1 regression):
     * BE-APP-BIL-04: an Application rejected (not enrolled) while its Deposit claim waits: once a Manager confirms
     * that claim the money must be refunded (or the claim must have been withdrawn).
     */
    @Test
    void beAppBil04_confirmedDepositOfRejectedApplicationIsRefunded() throws Exception {
        RegressionSupport.Applied app = r.apply(6, "2-bed", "Basic");
        r.claim(app.auth(), app.depositInvoiceId()).andExpect(status().isOk());
        long manager = r.userId(TestAuth.MANAGER_A);
        long studentId = r.userId(RegressionSupport.student(6));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(manager, TestAuth.MANAGER_A, "Manager", Role.MANAGER, null, null, "en", true,
                        null, Set.of(), 0L), null, java.util.List.of()));
        try {
            tx.executeWithoutResult(s -> events.publishEvent(new StudentNotEnrolled(studentId, r.termId, "Not on the list")));
        } finally {
            SecurityContextHolder.clearContext();
        }
        assertThat(jdbc.sql("SELECT status FROM app_application WHERE code = :c").param("c", app.id())
                .query(String.class).single()).isEqualTo("REJECTED");
        int confirm = r.confirm(app.depositInvoiceId()).andReturn().getResponse().getStatus();
        String invoice = jdbc.sql("SELECT status FROM bil_invoice WHERE code = :c").param("c", app.depositInvoiceId())
                .query(String.class).single();
        long refunds = jdbc.sql("""
                SELECT count(*) FROM bil_refund f JOIN bil_invoice i ON i.id = f.invoice_id WHERE i.code = :c
                """).param("c", app.depositInvoiceId()).query(Long.class).single();
        assertThat(!"PAID".equals(invoice) || refunds > 0)
                .as("claim confirm → HTTP %d, invoice %s, refunds %d", confirm, invoice, refunds).isTrue();
    }

    /** TC-BIL-045 (Wave 1 regression): BE-APP-BIL-05: the current month cannot be closed before it ends (409 PERIOD_NOT_ENDED). */
    @Test
    void beAppBil05_currentMeterPeriodCannotBeClosedEarly() throws Exception {
        java.time.LocalDate today = java.time.LocalDate.now(TimeConfig.CAMPUS_ZONE);
        org.junit.jupiter.api.Assumptions.assumeTrue(today.getDayOfMonth() < today.lengthOfMonth());
        String staff = r.bearer(TestAuth.MANAGER_B);
        String json = RegressionSupport.body(mvc.perform(get("/meter-periods").param("block", "B")
                .header(HttpHeaders.AUTHORIZATION, staff)).andExpect(status().isOk()));
        String period = JsonPath.read(json, "$.items[0].id");
        var res = mvc.perform(post("/meter-periods/" + period + "/close").header(HttpHeaders.AUTHORIZATION, staff))
                .andReturn().getResponse();
        assertThat(res.getStatus()).as(res.getContentAsString()).isEqualTo(409);
        assertThat(res.getContentAsString()).contains("PERIOD_NOT_ENDED");
    }

    /** TC-BIL-046 (Wave 1 regression): BE-APP-BIL-06: an office rejection refunds the whole Deposit, whatever the student-cancellation rule says. */
    @Test
    void beAppBil06_officeRejectionRefundsWholeDeposit() throws Exception {
        jdbc.sql("UPDATE cfg_refund_rule SET refund_percent = 80 WHERE trigger_code = 'CANCEL_BEFORE_RESULTS'").update();
        try {
            RegressionSupport.Applied app = r.apply(7, "2-bed", "Basic");
            r.pay(app.auth(), app.depositInvoiceId());
            r.postJson("/applications/" + app.id() + "/review", r.manager(),
                    "{\"decision\":\"Rejected\",\"note\":\"Documents do not match the student records.\"}")
                    .andExpect(status().is2xxSuccessful());
            var row = jdbc.sql("""
                    SELECT f.paid_amount, f.amount FROM bil_refund f JOIN bil_invoice i ON i.id = f.invoice_id
                    WHERE i.code = :c
                    """).param("c", app.depositInvoiceId()).query((rs, i) -> new long[] { rs.getLong(1), rs.getLong(2) })
                    .single();
            assertThat(row[1]).as("refund of a %d Deposit", row[0]).isEqualTo(row[0]);
        } finally {
            jdbc.sql("UPDATE cfg_refund_rule SET refund_percent = 100 WHERE trigger_code = 'CANCEL_BEFORE_RESULTS'")
                    .update();
        }
    }
}
