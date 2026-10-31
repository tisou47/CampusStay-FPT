package vn.fpt.campusstay;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Block Manager › Block settings, inside the Admin limits (TC-CFG-014, 015, 031). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BlockSettingsIT {

    private static final String VALID = """
            {"block":"A","deskOpens":"07:00","deskCloses":"21:30","visitFrom":"08:00","visitUntil":"22:00",
             "quiet":"23:30","houseRules":"No guests overnight. Quiet hours from 23:30."}""";

    @Autowired
    MockMvc mvc;

    private ResultActions save(String auth, String body) throws Exception {
        return mvc.perform(put("/block-settings").header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** TC-CFG-014: the Block's settings and the Admin limits; the Manager saves a change, which is audited. */
    @Test
    void readAndSave() throws Exception {
        mvc.perform(get("/block-settings").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_A)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deskOpens").value("07:30"))
                .andExpect(jsonPath("$.deskCloses").value("21:00"))
                .andExpect(jsonPath("$.visitFrom").value("08:00"))
                .andExpect(jsonPath("$.visitUntil").value("21:30"))
                .andExpect(jsonPath("$.quiet").value("23:00"))
                .andExpect(jsonPath("$.limits.visitWindow").value("07:00 – 22:00"))
                .andExpect(jsonPath("$.limits.quietStartsBy").value("23:30"))
                .andExpect(jsonPath("$.quietOptions", contains("21:00", "21:30", "22:00", "22:30", "23:00", "23:30")));

        save(bearer(mvc, MANAGER_A), VALID).andExpect(status().isOk())
                .andExpect(jsonPath("$.deskOpens").value("07:00"))
                .andExpect(jsonPath("$.visitUntil").value("22:00"))
                .andExpect(jsonPath("$.quiet").value("23:30"))
                .andExpect(jsonPath("$.houseRules").value("No guests overnight. Quiet hours from 23:30."))
                .andExpect(jsonPath("$.editedBy").value("Le Hoang Nam"))
                .andExpect(jsonPath("$.editedAt").isString());
        mvc.perform(get("/admin/audit-log").param("action", "Block settings updated")
                .header(HttpHeaders.AUTHORIZATION, bearer(mvc, ADMIN)))
                .andExpect(jsonPath("$.items", hasSize(1)));
    }

    /** TC-CFG-015 (negative): values outside the Admin limits or out of order are named per field; Manager only. */
    @Test
    void rejectsValuesOutsideTheLimits() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        save(manager, VALID.replace("\"visitFrom\":\"08:00\"", "\"visitFrom\":\"06:30\"")
                .replace("\"deskCloses\":\"21:30\"", "\"deskCloses\":\"06:00\"")
                .replace("\"quiet\":\"23:30\"", "\"quiet\":\"23:45\""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.visitFrom").exists())
                .andExpect(jsonPath("$.details.fields.deskCloses").exists())
                .andExpect(jsonPath("$.details.fields.quiet").exists());
        save(manager, VALID.replace("\"visitUntil\":\"22:00\"", "\"visitUntil\":\"7pm\""))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.visitUntil").exists());
        save(manager, VALID.replace("\"visitUntil\":\"22:00\"", "\"visitUntil\":\"07:30\""))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details.fields.visitUntil").exists());

        save(bearer(mvc, STAFF_A), VALID).andExpect(status().isForbidden());
        save(bearer(mvc, MANAGER_B), VALID).andExpect(status().isOk()); // any Manager, every Block (ADR-19)
    }

    /**
     * TC-CFG-031: the house rules are saved without desk hours (review R-08: no longer asked); the stored desk hours
     * stay as they were.
     */
    @Test
    void savesHouseRulesWithoutDeskHours() throws Exception {
        save(bearer(mvc, MANAGER_A), """
                {"block":"B","visitFrom":"08:30","visitUntil":"21:00","quiet":"22:30","houseRules":"Shoes off."}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.visitFrom").value("08:30"))
                .andExpect(jsonPath("$.houseRules").value("Shoes off."))
                .andExpect(jsonPath("$.deskOpens").value("07:30"))
                .andExpect(jsonPath("$.deskCloses").value("21:00"));
    }
}
