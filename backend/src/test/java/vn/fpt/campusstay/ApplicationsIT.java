package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

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

import vn.fpt.campusstay.service.application.ApplicationService;

/** Application wizard, roommate pairs, cancellation and expiry (TC-APP-NNN). Each test uses its own students. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ApplicationsIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    ApplicationService applications;

    ApplyFlow flow;

    @BeforeEach
    void openTerm() {
        flow = new ApplyFlow(mvc, jdbc);
        flow.openTerm();
    }

    private static String student(int n) {
        return "se19%04d@student.campusstay.test".formatted(n);
    }

    /** TC-APP-001: the student's Term is the open one; catalog prices and eligibility for it. */
    @Test
    void catalogAndEligibility() throws Exception {
        String auth = bearer(mvc, student(11));
        mvc.perform(get("/terms").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.items[?(@.current == true)].name", contains(ApplyFlow.TERM_NAME)));
        mvc.perform(get("/catalog").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roomTypes", hasSize(3)))
                .andExpect(jsonPath("$.roomTypes[0].id").isString())
                .andExpect(jsonPath("$.prices", hasSize(9)))
                .andExpect(jsonPath("$.prices[?(@.roomTypeId == '" + flow.roomTypeId("4-bed") + "' && @.roomClassId == '"
                        + flow.roomClassId("Standard") + "')].termPrice", contains(6_900_000)))
                .andExpect(jsonPath("$.depositRate").value(0.2))
                .andExpect(jsonPath("$.utilityDeposit").value(600_000))
                .andExpect(jsonPath("$.preferenceOptions.region", hasItem("Mekong Delta")))
                .andExpect(jsonPath("$.relationships", hasItem("Mother")));
        mvc.perform(get("/applications/eligibility").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eligible").value(true))
                .andExpect(jsonPath("$.term.name").value(ApplyFlow.TERM_NAME))
                .andExpect(jsonPath("$.term.depositWindowHours").value(48))
                .andExpect(jsonPath("$.checks[0].title").value("Registration is open"))
                .andExpect(jsonPath("$.checks[*].passed", hasItem(true)));
    }

    /** TC-APP-002: submit with a Deposit Invoice, then the list, detail, Home and notification; a second one is refused. */
    @Test
    void submitsApplicationWithDeposit() throws Exception {
        String auth = bearer(mvc, student(12));
        String json = flow.submit(auth, flow.body("4-bed", "Standard", null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", startsWith("APP-" + ApplyFlow.TERM_CODE + "-")))
                .andExpect(jsonPath("$.depositInvoiceId", startsWith("INV-" + ApplyFlow.TERM_CODE + "-")))
                .andExpect(jsonPath("$.depositDueAt").isString())
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(json, "$.id");
        String invoice = JsonPath.read(json, "$.depositInvoiceId");

        mvc.perform(get("/students/me/applications").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].termName").value(ApplyFlow.TERM_NAME))
                .andExpect(jsonPath("$.items[0].roomTypeName").value("4-bed"))
                .andExpect(jsonPath("$.items[0].deposit").value(1_380_000))
                .andExpect(jsonPath("$.items[0].status").value("Awaiting Deposit"))
                .andExpect(jsonPath("$.activeTermName").value(ApplyFlow.TERM_NAME));
        mvc.perform(get("/applications/" + id).header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Awaiting Deposit"))
                .andExpect(jsonPath("$.surchargeRate").value(0.15))
                .andExpect(jsonPath("$.twoBed").value(false))
                .andExpect(jsonPath("$.roommate").value((Object) null))
                .andExpect(jsonPath("$.invoices[0].id").value(invoice))
                .andExpect(jsonPath("$.invoices[0].type").value("deposit"))
                .andExpect(jsonPath("$.invoices[0].status").value("Unpaid"))
                .andExpect(jsonPath("$.events[0].title").value("Application created"))
                .andExpect(jsonPath("$.events[0].state").value("done"))
                .andExpect(jsonPath("$.events[1].title").value("Pay the Deposit"))
                .andExpect(jsonPath("$.events[1].state").value("current"))
                .andExpect(jsonPath("$.canCancel").value(true))
                .andExpect(jsonPath("$.cancelPolicy").isString());
        mvc.perform(get("/students/me/home").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.firstName").isString())
                .andExpect(jsonPath("$.term.name").value(ApplyFlow.TERM_NAME))
                .andExpect(jsonPath("$.application.id").value(id))
                .andExpect(jsonPath("$.application.status").value("Awaiting Deposit"))
                .andExpect(jsonPath("$.dueInvoice.id").value(invoice))
                .andExpect(jsonPath("$.dueInvoice.amount").value(1_380_000))
                .andExpect(jsonPath("$.invoices.due").value(1))
                .andExpect(jsonPath("$.allocation").value((Object) null));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.items[0].title").value("Pay your Deposit"))
                .andExpect(jsonPath("$.items[0].link").value("/student/invoices/" + invoice + "/pay"));
        flow.submit(auth, flow.body("2-bed", "Basic", null))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_ELIGIBLE"));
    }

    /** TC-APP-003 (negative): contact, consent and roommate rules are named per field. */
    @Test
    void applicationIsValidated() throws Exception {
        String auth = bearer(mvc, student(13));
        String body = """
                {"roomTypeId":"%s","roomClassId":"%s","roommate":{"mode":"invite","studentCode":"SE190014"},
                 "contact":{"phone":"12","relationship":"Neighbour"},"consent":{"matching":true,"rules":false}}"""
                .formatted(flow.roomTypeId("4-bed"), flow.roomClassId("Basic"));
        flow.submit(auth, body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details.fields.roommate").value("You can invite a roommate only for a 2-bed Room Type."))
                .andExpect(jsonPath("$.details.fields.phone").exists())
                .andExpect(jsonPath("$.details.fields.emergencyName").exists())
                .andExpect(jsonPath("$.details.fields.relationship").exists())
                .andExpect(jsonPath("$.details.fields.consent").exists());
        assertThat(flow.statuses(auth)).isEmpty();
    }

    /** TC-APP-004 (privacy): the same answer for every unusable code, and a limited number of checks. */
    @Test
    void roommateCheckIsPrivacySafeAndLimited() throws Exception {
        String auth = bearer(mvc, student(3));
        String[] codes = { "SE190004", "SE190003", "SE190030", "SE199999", "SE190015" };
        boolean[] valid = { true, false, false, false, true };
        for (int i = 0; i < codes.length; i++) {
            mvc.perform(post("/applications/roommate-check").header(HttpHeaders.AUTHORIZATION, auth)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"studentCode\":\"" + codes[i] + "\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.valid").value(valid[i]))
                    .andExpect(jsonPath("$.checksLeft").value(4 - i));
        }
        mvc.perform(post("/applications/roommate-check").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"studentCode\":\"SE190004\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("ROOMMATE_CHECKS_EXHAUSTED"));
    }

    /**
     * TC-APP-005 (business rule): an invited pair reaches the office together: the first to pay waits as
     * Awaiting Roommate; both are Submitted when the second Deposit is paid.
     */
    @Test
    void invitedPairIsSubmittedTogether() throws Exception {
        String inviter = bearer(mvc, student(5));
        String invitee = bearer(mvc, student(6));
        ApplyFlow.Applied first = flow.apply(inviter, "2-bed", "Premium", "{\"mode\":\"invite\",\"studentCode\":\"se190006\"}");
        String view = mvc.perform(get("/students/me/roommate-invitation").header(HttpHeaders.AUTHORIZATION, invitee))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.invitation.fromName").isString())
                .andExpect(jsonPath("$.invitation.roomTypeName").value("2-bed"))
                .andExpect(jsonPath("$.invitation.roomClassName").value("Premium"))
                .andExpect(jsonPath("$.invitation.termPrice").value(11_700_000))
                .andExpect(jsonPath("$.invitation.deposit").value(2_340_000))
                .andReturn().getResponse().getContentAsString();
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, invitee))
                .andExpect(jsonPath("$.items[0].title").value("Roommate invitation"));

        flow.pay(inviter, first.depositInvoiceId());
        assertThat(flow.statuses(inviter)).containsExactly("Awaiting Roommate");

        String invitationId = JsonPath.read(view, "$.invitation.id");
        String answer = mvc.perform(post("/roommate-invitations/" + invitationId + "/respond")
                .header(HttpHeaders.AUTHORIZATION, invitee).contentType(MediaType.APPLICATION_JSON).content("{\"accept\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applicationId", startsWith("APP-")))
                .andReturn().getResponse().getContentAsString();
        assertThat(flow.statuses(invitee)).containsExactly("Awaiting Deposit");
        flow.pay(invitee, JsonPath.read(answer, "$.depositInvoiceId"));

        assertThat(flow.statuses(inviter)).containsExactly("Submitted");
        assertThat(flow.statuses(invitee)).containsExactly("Submitted");
        mvc.perform(get("/applications/" + first.id()).header(HttpHeaders.AUTHORIZATION, inviter))
                .andExpect(jsonPath("$.twoBed").value(true))
                .andExpect(jsonPath("$.roommate.mode").value("invite"))
                .andExpect(jsonPath("$.roommate.studentCode").value("SE190006"))
                .andExpect(jsonPath("$.roommate.status").value("Accepted"));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, inviter))
                .andExpect(jsonPath("$.items[*].title", hasItem("Application submitted")));
    }

    /** TC-APP-006: a declined invitation leaves the inviter matched automatically. */
    @Test
    void declinedInvitationFallsBackToAutomaticMatching() throws Exception {
        String inviter = bearer(mvc, student(7));
        String invitee = bearer(mvc, student(8));
        ApplyFlow.Applied app = flow.apply(inviter, "2-bed", "Basic", "{\"mode\":\"invite\",\"studentCode\":\"SE190008\"}");
        String invitationId = JsonPath.read(mvc.perform(get("/students/me/roommate-invitation")
                .header(HttpHeaders.AUTHORIZATION, invitee)).andReturn().getResponse().getContentAsString(),
                "$.invitation.id");
        mvc.perform(post("/roommate-invitations/" + invitationId + "/respond").header(HttpHeaders.AUTHORIZATION, invitee)
                .contentType(MediaType.APPLICATION_JSON).content("{\"accept\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.applicationId").value((Object) null));
        mvc.perform(get("/students/me/roommate-invitation").header(HttpHeaders.AUTHORIZATION, invitee))
                .andExpect(jsonPath("$.invitation").value((Object) null));
        mvc.perform(get("/applications/" + app.id()).header(HttpHeaders.AUTHORIZATION, inviter))
                .andExpect(jsonPath("$.roommate.mode").value("auto"))
                .andExpect(jsonPath("$.events[*].title", hasItem("Roommate invitation not accepted")));
        flow.pay(inviter, app.depositInvoiceId());
        assertThat(flow.statuses(inviter)).containsExactly("Submitted");
    }

    /** TC-APP-007: cancelling voids an unpaid Deposit; a paid one is refunded by the rule; the student may apply again. */
    @Test
    void cancellationVoidsOrRefunds() throws Exception {
        String auth = bearer(mvc, student(16));
        ApplyFlow.Applied unpaid = flow.apply(auth, "6-bed", "Basic", null);
        mvc.perform(post("/applications/" + unpaid.id() + "/cancel").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Found a flat\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(get("/invoices/" + unpaid.depositInvoiceId()).header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.status").value("Void"));

        ApplyFlow.Applied paid = flow.apply(auth, "6-bed", "Basic", "{\"mode\":\"auto\"}");
        flow.pay(auth, paid.depositInvoiceId());
        mvc.perform(post("/applications/" + paid.id() + "/cancel").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isNoContent());
        assertThat(flow.statuses(auth)).containsExactly("Cancelled", "Cancelled");
        List<String> refunds = jdbc.sql("""
                SELECT r.status || ':' || r.amount FROM bil_refund r JOIN bil_invoice i ON i.student_id = r.student_id
                WHERE i.code = :code
                """).param("code", paid.depositInvoiceId()).query(String.class).list();
        assertThat(refunds).containsExactly("APPROVED:900000");
        mvc.perform(post("/applications/" + paid.id() + "/cancel").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CANNOT_CANCEL"));
    }

    /** TC-APP-008 (job): an unpaid Application expires when its Deposit window passes; its Invoice is voided. */
    @Test
    void unpaidApplicationExpires() throws Exception {
        String auth = bearer(mvc, student(17));
        ApplyFlow.Applied app = flow.apply(auth, "4-bed", "Basic", null);
        jdbc.sql("UPDATE app_application SET deposit_due_at = now() - interval '1 minute' WHERE code = :code")
                .param("code", app.id()).update();
        assertThat(applications.expireOverdue()).isEqualTo(1);
        assertThat(flow.statuses(auth)).containsExactly("Expired");
        mvc.perform(get("/invoices/" + app.depositInvoiceId()).header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.status").value("Void"));
        mvc.perform(get("/applications/eligibility").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(jsonPath("$.eligible").value(true));
    }

    /** TC-APP-009 (permission): Staff cannot use student screens; another student's Application is 404. */
    @Test
    void applicationsArePrivate() throws Exception {
        String owner = bearer(mvc, student(18));
        ApplyFlow.Applied app = flow.apply(owner, "4-bed", "Basic", null);
        mvc.perform(get("/applications/" + app.id()).header(HttpHeaders.AUTHORIZATION, bearer(mvc, student(19))))
                .andExpect(status().isNotFound());
        mvc.perform(post("/applications/" + app.id() + "/cancel").header(HttpHeaders.AUTHORIZATION, bearer(mvc, student(19))))
                .andExpect(status().isNotFound());
        mvc.perform(get("/students/me/home").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_A)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/students/me/profile").header(HttpHeaders.AUTHORIZATION, owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.studentCode").value("SE190018"))
                .andExpect(jsonPath("$.gender").value("Male"))
                .andExpect(jsonPath("$.contact.phone").value("0901234567"))
                .andExpect(jsonPath("$.contact.email").value("me@example.com"))
                .andExpect(jsonPath("$.contact.relationship").value("Mother"));
    }
}
