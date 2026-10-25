package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.STUDENT;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.util.List;

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

import com.jayway.jsonpath.JsonPath;

/**
 * Admin configuration grouped by subject and the rules screens (spec §6.17, §9; TC-CFG-024, 025): settings say
 * where they act and are announced when they change; Who may apply counts the students failing each check;
 * matching weights are levels; the dry run compares the draft with the rules in use.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AdminSettingsIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private String json(String path, String auth) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, auth)).andReturn().getResponse()
                .getContentAsString();
    }

    private ResultActions send(String method, String path, String auth, String json) throws Exception {
        var builder = method.equals("PUT") ? put(path) : post(path);
        return mvc.perform(builder.header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    /**
     * TC-CFG-024: each group lists its settings with where they act; an out-of-range value is refused; a saved
     * change is audited and announced to students; grouped settings left System parameters; only the Admin edits.
     */
    @Test
    void groupedSettings() throws Exception {
        String admin = bearer(mvc, ADMIN);
        mvc.perform(get("/admin/settings/deadlines").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Deadlines and reminders"))
                .andExpect(jsonPath("$.settings[0].key").value("fee.deposit_hours"))
                .andExpect(jsonPath("$.settings[0].value").value(48))
                .andExpect(jsonPath("$.settings[?(@.key == 'payment.reminder_first_days')].value", contains(3)))
                .andExpect(jsonPath("$.settings[?(@.key == 'payment.reminder_first_days')].usedIn",
                        contains("Balance and next-Term fee reminders")));
        mvc.perform(get("/admin/settings/refunds").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.settings[?(@.key == 'termination.debt_reaches_deposit')].value", contains(true)))
                .andExpect(jsonPath("$.settings[?(@.key == 'late_check_in.max_days')].value", contains(14)));
        send("PUT", "/admin/settings/stay", admin, "{\"values\":{\"stay.max_terms\":12}}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields['stay.max_terms']").value("Enter a whole number from 1 to 9."));
        send("PUT", "/admin/settings/stay", admin, "{\"values\":{\"stay.max_terms\":6,\"stay.auto_extension\":false}}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings[?(@.key == 'stay.max_terms')].value", contains(6)))
                .andExpect(jsonPath("$.settings[?(@.key == 'stay.auto_extension')].value", contains(false)));
        send("PUT", "/admin/settings/deadlines", admin, "{\"values\":{\"fee.deposit_hours\":36}}")
                .andExpect(status().isOk());
        mvc.perform(get("/admin/fees").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.depositHours").value(36));
        mvc.perform(get("/admin/audit-log").header(HttpHeaders.AUTHORIZATION, admin).param("action", "Settings updated"))
                .andExpect(jsonPath("$.items", hasSize(2)));
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STUDENT)))
                .andExpect(jsonPath("$.items[*].title", hasItem("Changed: Stay and renewal")))
                .andExpect(jsonPath("$.items[?(@.title == 'Changed: Stay and renewal')].changes[0].after", contains("6")));
        mvc.perform(get("/admin/system-parameters").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.sections[*].fields[*].key", not(hasItem("stay.max_terms"))));
        mvc.perform(get("/admin/settings/nothing").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isNotFound());
        mvc.perform(get("/admin/settings/stay").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_A)))
                .andExpect(status().isForbidden());
    }

    /**
     * TC-CFG-025: Who may apply gives the students failing each check now and the checks without a switch; weights
     * read as levels and save from levels (Very important counts twice); the dry run of four approved Applications
     * shows the draft next to the rules in use, with an example Room.
     */
    @Test
    void rulesScreens() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String enrolled = "$.criteria[?(@.key == 'ENROLLED')].failing";
        List<Integer> before = JsonPath.read(json("/admin/eligibility", admin), enrolled);
        jdbc.sql("""
                UPDATE auth_student SET enrollment_status = 'GRADUATED'
                WHERE user_id = (SELECT id FROM auth_user WHERE email = :e)
                """).param("e", StayFlow.student(40)).update();
        mvc.perform(get("/admin/eligibility").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.students", greaterThan(40)))
                .andExpect(jsonPath(enrolled, contains(before.getFirst() + 1)))
                .andExpect(jsonPath("$.criteria[?(@.key == 'NO_OVERDUE_INVOICE')].failing", contains(0)))
                .andExpect(jsonPath("$.fixed[*].key", contains("REGISTRATION_OPEN", "VERIFIED")));
        mvc.perform(get("/admin/matching").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.weights[*].level", contains("Important", "Important", "Important")));

        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        long term = flow.openTerm();
        StayFlow stay = new StayFlow(mvc, jdbc, flow, term);
        StringBuilder ids = new StringBuilder();
        for (int n = 20; n < 24; n++) {
            String auth = bearer(mvc, StayFlow.student(n));
            ApplyFlow.Applied app = flow.apply(auth, "4-bed", "Standard", "{\"mode\":\"auto\"}");
            flow.pay(auth, app.depositInvoiceId());
            ids.append(ids.isEmpty() ? "" : ",").append('"').append(app.id()).append('"');
        }
        stay.postJson("/applications/bulk-review", bearer(mvc, MANAGER_A),
                "{\"ids\":[" + ids + "],\"decision\":\"Approved\"}").andExpect(status().isOk());

        String levels = """
                {"order":[{"key":"PRIORITY_GROUP"},{"key":"SUBMITTED_AT"}],
                 "weights":[{"key":"MAJOR","level":"Very important"},{"key":"COHORT","level":"Important"},
                            {"key":"REGION","level":"Not used"}],
                 "boost":1.2}""";
        String preview = send("POST", "/admin/matching/preview", admin, levels)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.students").value(4))
                .andExpect(jsonPath("$.draft.placed").value(4))
                .andExpect(jsonPath("$.inUse.placed").value(4))
                .andExpect(jsonPath("$.moved").value(notNullValue()))
                .andReturn().getResponse().getContentAsString();
        // An example Room exists when two students share one; it explains the criteria the draft uses.
        if (JsonPath.read(preview, "$.example") != null) {
            assertThat((List<String>) JsonPath.read(preview, "$.example.attributes[*].key"))
                    .isSubsetOf("MAJOR", "COHORT");
        }
        send("PUT", "/admin/matching", admin, levels).andExpect(status().isOk());
        mvc.perform(get("/admin/matching").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.weights[*].value", contains(67, 33, 0)))
                .andExpect(jsonPath("$.weights[*].level", contains("Very important", "Important", "Not used")));
        send("PUT", "/admin/matching", admin, levels.replace("Very important", "Not used").replace("\"Important\"",
                "\"Not used\""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.weights").value("Use at least one matching criterion."));
    }
}
