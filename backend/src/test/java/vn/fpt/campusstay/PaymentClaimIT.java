package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.time.Instant;
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
import org.springframework.test.web.servlet.ResultActions;

import vn.fpt.campusstay.service.application.ApplicationService;
import vn.fpt.campusstay.service.billing.PaymentClaimService;
import vn.fpt.campusstay.service.billing.PaymentReminders;

/**
 * Payment claims (ADR-22, spec §6.7): "I have transferred", the Managers' queue, confirmations one by one or in bulk,
 * rejections that give the remaining time back and cancel after too many, reminders and the hourly summary
 * (TC-BIL-032…036).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PaymentClaimIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    ApplicationService applications;

    @Autowired
    PaymentClaimService claims;

    @Autowired
    PaymentReminders reminders;

    ApplyFlow flow;

    @BeforeEach
    void openTerm() {
        flow = new ApplyFlow(mvc, jdbc);
        flow.openTerm();
    }

    private static String student(int n) {
        return StayFlow.student(n);
    }

    private ResultActions postJson(String path, String auth, String body) throws Exception {
        return mvc.perform(post(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions getAs(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth));
    }

    /** Moves both deadlines of a Deposit (the Application's window and its Invoice) by SQL. */
    private void depositDueIn(String invoiceCode, String interval) {
        jdbc.sql("UPDATE bil_invoice SET due_at = now() + CAST(:i AS interval) WHERE code = :code")
                .param("i", interval).param("code", invoiceCode).update();
        jdbc.sql("""
                UPDATE app_application a SET deposit_due_at = i.due_at FROM bil_invoice i
                WHERE i.code = :code AND a.id = i.application_id
                """).param("code", invoiceCode).update();
    }

    /**
     * TC-BIL-032: the claim waits for a Manager and stops the Deposit window (the Application does not expire); the
     * queue lists it with the count and total; a bulk confirmation pays each Invoice at the time of its claim, one
     * audit entry each, and the Applications are submitted; unknown Invoices are skipped.
     */
    @Test
    void claimStopsTheClockAndBulkConfirmationPays() throws Exception {
        String first = bearer(mvc, student(30));
        ApplyFlow.Applied a = flow.apply(first, "4-bed", "Premium", null);
        flow.claim(first, a.depositInvoiceId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Waiting for confirmation"))
                .andExpect(jsonPath("$.rejected").value(0));
        getAs("/invoices/" + a.depositInvoiceId() + "/payment", first)
                .andExpect(jsonPath("$.invoice.status").value("Awaiting confirmation"))
                .andExpect(jsonPath("$.canClaim").value(false))
                .andExpect(jsonPath("$.qr").value((Object) null))
                .andExpect(jsonPath("$.claim.status").value("Waiting for confirmation"));

        // The Deposit window passes while the claim waits: nothing expires.
        depositDueIn(a.depositInvoiceId(), "-1 hour");
        applications.expireOverdue();
        assertThat(flow.statuses(first)).containsExactly("Awaiting Deposit");

        String second = bearer(mvc, student(31));
        ApplyFlow.Applied b = flow.apply(second, "4-bed", "Basic", null);
        flow.claim(second, b.depositInvoiceId()).andExpect(status().isOk());

        String manager = bearer(mvc, MANAGER_B);
        getAs("/payment-claims?type=deposit&q=SE190030", manager)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].invoiceId").value(a.depositInvoiceId()))
                .andExpect(jsonPath("$.items[0].studentCode").value("SE190030"))
                .andExpect(jsonPath("$.items[0].typeLabel").value("Deposit"))
                .andExpect(jsonPath("$.items[0].amount").value(1_560_000))
                .andExpect(jsonPath("$.items[0].claimedAt").isString())
                .andExpect(jsonPath("$.items[0].rejected").value(0));
        getAs("/payment-claims", manager)
                .andExpect(jsonPath("$.summary.count").value(2))
                .andExpect(jsonPath("$.summary.amount").value(1_560_000 + 1_200_000));

        postJson("/payment-claims/confirm", manager, "{\"invoiceIds\":[\"%s\",\"%s\",\"INV-TT31-999999\"]}"
                .formatted(a.depositInvoiceId(), b.depositInvoiceId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confirmed").value(2))
                .andExpect(jsonPath("$.amount").value(2_760_000))
                .andExpect(jsonPath("$.skipped[0].invoiceId").value("INV-TT31-999999"));
        assertThat(flow.statuses(first)).containsExactly("Submitted");
        assertThat(flow.statuses(second)).containsExactly("Submitted");
        // Paid at the time of the claim: "earlier Deposit first" uses it (spec §6.7).
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_invoice i JOIN bil_payment_claim c ON c.invoice_id = i.id
                JOIN app_application a ON a.id = i.application_id
                WHERE i.code IN (:codes) AND i.status = 'PAID' AND i.paid_at = c.claimed_at
                  AND a.submitted_at = c.claimed_at AND i.payment_method = 'TRANSFER'
                """).param("codes", List.of(a.depositInvoiceId(), b.depositInvoiceId())).query(Long.class).single())
                .isEqualTo(2);
        assertThat(jdbc.sql("SELECT count(*) FROM shared_audit_log WHERE action = 'PAYMENT_CONFIRMED' AND object_label IN (:codes)")
                .param("codes", List.of(a.depositInvoiceId(), b.depositInvoiceId())).query(Long.class).single())
                .isEqualTo(2);
        getAs("/students/me/invoices", first)
                .andExpect(jsonPath("$.items[0].status").value("Paid"))
                .andExpect(jsonPath("$.items[0].paymentMethod").value("Bank transfer"));
        getAs("/invoices/" + a.depositInvoiceId() + "/receipt", first).andExpect(status().isOk());
        getAs("/notifications", first).andExpect(jsonPath("$.items[*].title", hasItem("Payment received")));
        getAs("/payment-claims", manager).andExpect(jsonPath("$.total").value(0));
    }

    /**
     * TC-BIL-033: a rejection needs a reason; the Invoice is Unpaid again and the deadline continues with the time
     * that was left (at least payment.rejected_claim_min_hours); the student is told; a second rejection cancels the
     * Deposit and the Application expires.
     */
    @Test
    void rejectionsGiveTimeBackThenCancel() throws Exception {
        String auth = bearer(mvc, student(32));
        ApplyFlow.Applied app = flow.apply(auth, "4-bed", "Basic", null);
        String manager = bearer(mvc, MANAGER_A);
        flow.claim(auth, app.depositInvoiceId()).andExpect(status().isOk());
        postJson("/payment-claims/reject", manager, "{\"invoiceIds\":[\"%s\"],\"reason\":\" \"}"
                .formatted(app.depositInvoiceId()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.reason").isString());
        postJson("/payment-claims/reject", manager, "{\"invoiceIds\":[\"%s\"],\"reason\":\"No transfer with this content.\"}"
                .formatted(app.depositInvoiceId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rejected").value(1))
                .andExpect(jsonPath("$.cancelled").value(0));
        getAs("/invoices/" + app.depositInvoiceId() + "/payment", auth)
                .andExpect(jsonPath("$.invoice.status").value("Unpaid"))
                .andExpect(jsonPath("$.canClaim").value(true))
                .andExpect(jsonPath("$.claim.status").value("Rejected"))
                .andExpect(jsonPath("$.claim.rejected").value(1))
                .andExpect(jsonPath("$.claim.lastRejection.reason").value("No transfer with this content."));
        // The 48 hours left when the student claimed are given back; the Application's window follows.
        assertThat(jdbc.sql("""
                SELECT count(*) FROM bil_invoice i JOIN app_application a ON a.id = i.application_id
                WHERE i.code = :code AND i.due_at > now() + interval '47 hours' AND a.deposit_due_at = i.due_at
                """).param("code", app.depositInvoiceId()).query(Long.class).single()).isEqualTo(1);
        getAs("/notifications", auth).andExpect(jsonPath("$.items[*].title",
                hasItem("Transfer not confirmed · Deposit · " + ApplyFlow.TERM_NAME)))
                .andExpect(jsonPath("$.items[0].body", containsString(": No transfer with this content. Pay before")));

        // Little time left: at least 12 hours come back.
        depositDueIn(app.depositInvoiceId(), "1 hour");
        flow.claim(auth, app.depositInvoiceId()).andExpect(status().isOk());
        String other = bearer(mvc, student(33));
        ApplyFlow.Applied short1 = flow.apply(other, "4-bed", "Basic", null);
        depositDueIn(short1.depositInvoiceId(), "1 hour");
        flow.claim(other, short1.depositInvoiceId()).andExpect(status().isOk());
        postJson("/payment-claims/reject", manager, "{\"invoiceIds\":[\"%s\"],\"reason\":\"Not received.\"}"
                .formatted(short1.depositInvoiceId())).andExpect(status().isOk());
        assertThat(jdbc.sql("SELECT due_at > now() + interval '11 hours 59 minutes' FROM bil_invoice WHERE code = :code")
                .param("code", short1.depositInvoiceId()).query(Boolean.class).single()).isTrue();

        // The second rejection of the first student's Deposit cancels it: the Application expires.
        postJson("/payment-claims/reject", manager, "{\"invoiceIds\":[\"%s\"],\"reason\":\"Not received again.\"}"
                .formatted(app.depositInvoiceId()))
                .andExpect(jsonPath("$.cancelled").value(1));
        getAs("/invoices/" + app.depositInvoiceId(), auth).andExpect(jsonPath("$.status").value("Void"));
        assertThat(flow.statuses(auth)).containsExactly("Expired");
        getAs("/notifications", auth).andExpect(jsonPath("$.items[*].title",
                hasItem("Deposit · " + ApplyFlow.TERM_NAME + " cancelled")));
    }

    /**
     * TC-BIL-034 (validation, permission): one claim at a time; a paid or void Invoice and a Deposit past its
     * deadline cannot be claimed; a student cannot cancel while a claim waits; only Managers see the queue and
     * decide; an empty selection is refused; Invoices without a claim are skipped.
     */
    @Test
    void claimRules() throws Exception {
        String auth = bearer(mvc, student(34));
        ApplyFlow.Applied app = flow.apply(auth, "4-bed", "Basic", null);
        postJson("/invoices/" + app.depositInvoiceId() + "/claim", auth, "{\"reference\":\"" + "x".repeat(61) + "\"}")
                .andExpect(status().isBadRequest());
        flow.claim(auth, app.depositInvoiceId()).andExpect(status().isOk());
        flow.claim(auth, app.depositInvoiceId())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CLAIM_WAITING"));
        mvc.perform(post("/applications/" + app.id() + "/cancel").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CLAIM_WAITING"));

        getAs("/payment-claims", bearer(mvc, STAFF_A)).andExpect(status().isForbidden());
        getAs("/payment-claims", auth).andExpect(status().isForbidden());
        postJson("/payment-claims/confirm", bearer(mvc, STAFF_A), "{\"invoiceIds\":[\"%s\"]}"
                .formatted(app.depositInvoiceId())).andExpect(status().isForbidden());
        postJson("/payment-claims/confirm", auth, "{\"invoiceIds\":[\"%s\"]}".formatted(app.depositInvoiceId()))
                .andExpect(status().isForbidden());
        String manager = bearer(mvc, MANAGER_A);
        postJson("/payment-claims/confirm", manager, "{\"invoiceIds\":[]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.invoiceIds").isString());

        flow.confirm(app.depositInvoiceId()).andExpect(jsonPath("$.confirmed").value(1));
        flow.claim(auth, app.depositInvoiceId())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_PAID"));
        postJson("/payment-claims/reject", manager, "{\"invoiceIds\":[\"%s\"],\"reason\":\"Late.\"}"
                .formatted(app.depositInvoiceId()))
                .andExpect(jsonPath("$.rejected").value(0))
                .andExpect(jsonPath("$.skipped[0].invoiceId").value(app.depositInvoiceId()));

        String late = bearer(mvc, student(35));
        ApplyFlow.Applied lateApp = flow.apply(late, "4-bed", "Basic", null);
        depositDueIn(lateApp.depositInvoiceId(), "-1 minute");
        flow.claim(late, lateApp.depositInvoiceId())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DEADLINE_PASSED"));
        applications.expireOverdue();
        flow.claim(late, lateApp.depositInvoiceId())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVOICE_NOT_PAYABLE"));
    }

    /**
     * TC-BIL-035: a Utility Invoice is a debt: a claim made after its due date leaves the date as it was, a rejection
     * returns it to Overdue and rejections never cancel it.
     */
    @Test
    void debtsAreNeverCancelled() throws Exception {
        StayFlow stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
        stay.livesIn(36, "B-110", "A", true);
        String code = utilityInvoice(36, "-2 days");
        String auth = bearer(mvc, student(36));
        flow.claim(auth, code).andExpect(status().isOk());
        Instant due = jdbc.sql("SELECT due_at FROM bil_invoice WHERE code = :c").param("c", code)
                .query(java.sql.Timestamp.class).single().toInstant();
        String manager = bearer(mvc, MANAGER_A);
        for (int i = 0; i < 3; i++) {
            postJson("/payment-claims/reject", manager, "{\"invoiceIds\":[\"%s\"],\"reason\":\"Not received.\"}"
                    .formatted(code)).andExpect(jsonPath("$.cancelled").value(0));
            getAs("/invoices/" + code, auth).andExpect(jsonPath("$.status").value("Overdue"));
            assertThat(jdbc.sql("SELECT due_at FROM bil_invoice WHERE code = :c").param("c", code)
                    .query(java.sql.Timestamp.class).single().toInstant()).isEqualTo(due);
            flow.claim(auth, code).andExpect(status().isOk());
        }
        flow.confirm(code).andExpect(jsonPath("$.confirmed").value(1));
        getAs("/invoices/" + code, auth).andExpect(jsonPath("$.status").value("Paid"));
    }

    /**
     * TC-BIL-036: Balance reminders go out 3 and 1 days before the deadline, once each, never for a claim waiting;
     * the Managers hear once an hour how many claims wait.
     */
    @Test
    void remindersAndHourlySummary() throws Exception {
        StayFlow stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
        List<StayFlow.Applied> placed = stay.runRound1("2-bed", "Standard", 1, 2);
        String balance = balanceOf(placed.get(0).applicationId());
        String claimed = balanceOf(placed.get(1).applicationId());
        jdbc.sql("UPDATE bil_invoice SET due_at = now() + interval '2 days 12 hours' WHERE code IN (:c)")
                .param("c", List.of(balance, claimed)).update();
        flow.claim(placed.get(1).auth(), claimed).andExpect(status().isOk());

        assertThat(reminders.sendDue()).isEqualTo(1);
        assertThat(reminders.sendDue()).isZero();
        getAs("/notifications", placed.get(0).auth()).andExpect(jsonPath("$.items[*].title",
                hasItem("Payment due soon · Balance · " + ApplyFlow.TERM_NAME)));
        jdbc.sql("UPDATE bil_invoice SET due_at = now() + interval '20 hours' WHERE code = :c").param("c", balance)
                .update();
        assertThat(reminders.sendDue()).isEqualTo(1);
        assertThat(reminders.sendDue()).isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM ntf_email_outbox WHERE to_email = :to")
                .param("to", jdbc.sql("SELECT u.email FROM auth_user u JOIN app_application a ON a.student_id = u.id WHERE a.code = :a")
                        .param("a", placed.get(0).applicationId()).query(String.class).single())
                .query(Long.class).single()).isGreaterThanOrEqualTo(2);

        assertThat(claims.summarize(Instant.now().minusSeconds(3600))).isEqualTo(1);
        String json = getAs("/notifications", bearer(mvc, MANAGER_B)).andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<List<String>>read(json, "$.items[*].title")).contains("Payment claims to confirm");
        assertThat(claims.summarize(Instant.now().plusSeconds(60))).isZero();
    }

    private String balanceOf(String applicationCode) {
        return jdbc.sql("""
                SELECT i.code FROM bil_invoice i JOIN app_application a ON a.id = i.application_id
                WHERE a.code = :app AND i.type = 'BALANCE'
                """).param("app", applicationCode).query(String.class).single();
    }

    /** A Utility Invoice of the student's Allocation, due {@code dueIn} from now. */
    private String utilityInvoice(int n, String dueIn) {
        String code = "INV-TT31-U" + n;
        jdbc.sql("""
                INSERT INTO bil_invoice (code, term_id, student_id, allocation_id, building_id, type, title, amount, status,
                                         transfer_content, due_at, student_name, student_code, gender)
                SELECT :code, a.term_id, a.student_id, a.id, r.building_id, 'UTILITY', 'Utility · 10/2031', 320000,
                       CASE WHEN now() + CAST(:due AS interval) < now() THEN 'OVERDUE' ELSE 'UNPAID' END,
                       'CSTAYU' || :n, now() + CAST(:due AS interval), u.display_name, s.student_code, s.gender
                FROM asg_allocation a JOIN auth_user u ON u.id = a.student_id JOIN auth_student s ON s.user_id = u.id
                JOIN inv_bed b ON b.id = a.bed_id JOIN inv_room r ON r.id = b.room_id
                WHERE u.email = :email AND a.status = 'ACTIVE'
                """).param("code", code).param("due", dueIn).param("n", n).param("email", student(n)).update();
        return code;
    }
}
