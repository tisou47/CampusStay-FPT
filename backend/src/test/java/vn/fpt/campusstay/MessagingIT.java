package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.bearer;

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

/** Admin › Notification templates and Send email (TC-NTF-030…033). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class MessagingIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    StayFlow stay;

    @BeforeEach
    void openTerm() {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        stay = new StayFlow(mvc, jdbc, flow, flow.openTerm());
    }

    private ResultActions putAs(String path, String auth, String body) throws Exception {
        return mvc.perform(put(path).header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private String email(String mode, String extra) {
        return """
                {"mode":"%s","termId":"%d","templateKey":"ANNOUNCEMENT","subject":"Water off on Saturday"%s}"""
                .formatted(mode, stay.termId(), extra);
    }

    /** TC-NTF-030: templates with their variables and sample values; the push limit and unknown variables. */
    @Test
    void editsTemplates() throws Exception {
        String admin = bearer(mvc, ADMIN);
        mvc.perform(get("/admin/notification-templates").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.key == 'DEPOSIT_DUE')].variables[*]").value(contains("amount", "dueAt",
                        "term")))
                .andExpect(jsonPath("$.items[?(@.key == 'DEPOSIT_DUE')].inApp").value(hasItem(true)))
                .andExpect(jsonPath("$.sampleValues.amount").value("1,500,000 VND"));

        putAs("/admin/notification-templates/DEPOSIT_DUE", admin, "{\"body\":\"" + "x".repeat(161) + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.body").exists());
        putAs("/admin/notification-templates/DEPOSIT_DUE", admin, "{\"body\":\"Pay {{amount}} for {{room}}.\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.body").value(startsWith("{{room}} is not available here")));
        putAs("/admin/notification-templates/DEPOSIT_DUE", admin,
                "{\"push\":false,\"titleEn\":\"Your Deposit is due\",\"body\":\"Pay {{amount}} by {{dueAt}} ({{term}}).\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.push").value(false))
                .andExpect(jsonPath("$.titleEn").value("Your Deposit is due"))
                .andExpect(jsonPath("$.titleVi").value("Thanh toán tiền cọc"));
        mvc.perform(get("/admin/audit-log").param("action", "Template updated").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items", hasSize(1)));
        putAs("/admin/notification-templates/NO_SUCH_KEY", admin, "{}").andExpect(status().isNotFound());
        mvc.perform(get("/admin/notification-templates").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_A)))
                .andExpect(status().isForbidden());
    }

    /** TC-NTF-031: a test sends the unsaved text, with sample values, to the signed-in Admin. */
    @Test
    void sendsATestToTheAdmin() throws Exception {
        String admin = bearer(mvc, ADMIN);
        stay.postJson("/admin/notification-templates/REFUND_DECIDED/test", admin,
                "{\"titleEn\":\"Refund news\",\"body\":\"Your refund of {{amount}} was {{decision}}.\"}")
                .andExpect(status().isNoContent());
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[0].title").value("[Test] Refund news"))
                .andExpect(jsonPath("$.items[0].body").value("Your refund of 1,500,000 VND was approved."));
        mvc.perform(get("/admin/notification-templates").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[?(@.key == 'REFUND_DECIDED')].titleEn").value(hasItem("Refund decision")));
    }

    /** TC-NTF-032: options leave system emails out; the preview counts the group and renders the first email. */
    @Test
    void previewsAnEmail() throws Exception {
        stay.livesIn(1, "A-101", "A", true);
        stay.livesIn(2, "A-101", "B", true);
        stay.livesIn(3, "A-102", "A", false);
        String admin = bearer(mvc, ADMIN);
        mvc.perform(get("/admin/emails/options").header(HttpHeaders.AUTHORIZATION, admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$.templates[*].key").value(hasItem("ANNOUNCEMENT")))
                .andExpect(jsonPath("$.templates[*].key").value(not(hasItem("PASSWORD_RESET"))))
                .andExpect(jsonPath("$.groups[*].key").value(hasItem("residents")))
                .andExpect(jsonPath("$.blocks", contains("A", "B")))
                .andExpect(jsonPath("$.sendTimes[0].value").value("now"));

        stay.postJson("/admin/emails/preview", admin, email("bulk", ",\"group\":\"residents\",\"block\":\"A\""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(2))
                .andExpect(jsonPath("$.preview.subject").value("Water off on Saturday"))
                .andExpect(jsonPath("$.preview.lines[0]").value(startsWith("Hello ")))
                .andExpect(jsonPath("$.preview.lines[1]").value("Water off on Saturday"));
        stay.postJson("/admin/emails/preview", admin, email("bulk", ",\"group\":\"not-checked-in\""))
                .andExpect(jsonPath("$.count").value(1));
        stay.postJson("/admin/emails/preview", admin,
                email("bulk", ",\"group\":\"residents\",\"block\":\"A\",\"gender\":\"Female\""))
                .andExpect(jsonPath("$.count").value(0)).andExpect(jsonPath("$.preview").value((Object) null));
        stay.postJson("/admin/emails/preview", admin, email("one", ",\"studentCode\":\"se190025\""))
                .andExpect(jsonPath("$.count").value(1));
        stay.postJson("/admin/emails/preview", admin, email("bulk", ",\"group\":\"everyone\""))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.group").exists());
    }

    /** TC-NTF-033: sending queues one email per student (and the in-app notice with push); validation; Admin only. */
    @Test
    void sendsAnEmail() throws Exception {
        stay.livesIn(26, "B-101", "A", true);
        stay.livesIn(27, "B-101", "B", true);
        String admin = bearer(mvc, ADMIN);
        String body = email("bulk", ",\"group\":\"residents\",\"block\":\"B\",\"channel\":\"email-push\",\"sendAt\":\"%s\"");

        stay.postJson("/admin/emails", admin, body.formatted("tomorrow")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.sendAt").exists());
        long before = jdbc.sql("SELECT count(*) FROM ntf_email_outbox").query(Long.class).single();
        stay.postJson("/admin/emails", admin, body.formatted("now")).andExpect(status().isOk())
                .andExpect(jsonPath("$.queued").value(2));
        assertThat(jdbc.sql("SELECT count(*) FROM ntf_email_outbox").query(Long.class).single()).isEqualTo(before + 2);
        assertThat(jdbc.sql("SELECT queued_count FROM ntf_email_campaign ORDER BY id DESC LIMIT 1").query(Integer.class)
                .single()).isEqualTo(2);
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, bearer(mvc, StayFlow.student(26))))
                .andExpect(jsonPath("$.items[0].title").value("Water off on Saturday"));
        mvc.perform(get("/admin/audit-log").param("action", "Email campaign queued").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items", hasSize(1)));

        stay.postJson("/admin/emails", admin, email("one", ",\"studentCode\":\"SE199999\",\"channel\":\"email\",\"sendAt\":\"now\""))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.studentCode").exists());
        stay.postJson("/admin/emails", bearer(mvc, MANAGER_A), body.formatted("now")).andExpect(status().isForbidden());
    }
}
