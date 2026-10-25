package vn.fpt.campusstay;

import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STUDENT;
import static vn.fpt.campusstay.TestAuth.bearer;

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

import com.jayway.jsonpath.JsonPath;

/** The registration period card of the board and its details (spec §6.5; TC-CFG-023). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class RegistrationPeriodIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    /**
     * TC-CFG-023: the card shows the Term open for registration with its countdown, places and lowest price; its
     * details list the timeline, every price with its Deposit and the Beds per Room Type × Room Class × gender; a
     * Draft has no details.
     */
    @Test
    void cardAndDetails() throws Exception {
        long term = new ApplyFlow(mvc, jdbc).openTerm();
        jdbc.sql("UPDATE cfg_term SET house_rules = 'Quiet after 23:00.', faq = CAST(:faq AS jsonb) WHERE id = :id")
                .param("faq", "[{\"question\":\"Can I bring a fridge?\",\"answer\":\"No.\"}]").param("id", term)
                .update();
        int beds = jdbc.sql("""
                SELECT count(*) FROM inv_bed b JOIN inv_room r ON r.id = b.room_id JOIN inv_building u ON u.id = r.building_id
                WHERE b.status = 'IN_SERVICE' AND r.status = 'IN_SERVICE' AND u.status = 'ACTIVE'
                """).query(Integer.class).single();
        String student = bearer(mvc, STUDENT);
        mvc.perform(get("/registration-periods/current").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.card.termId").value(String.valueOf(term)))
                .andExpect(jsonPath("$.card.status").value("Open"))
                .andExpect(jsonPath("$.card.countdownTo").isString())
                .andExpect(jsonPath("$.card.places").value(beds))
                .andExpect(jsonPath("$.card.fromPrice").value(4500000));
        mvc.perform(get("/registration-periods/" + term).header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("Open"))
                .andExpect(jsonPath("$.timeline[0].key").value("registrationOpensAt"))
                .andExpect(jsonPath("$.timeline[0].done").value(true))
                .andExpect(jsonPath("$.timeline[*].key", hasItem("checkIn")))
                .andExpect(jsonPath("$.prices", hasSize(9)))
                .andExpect(jsonPath("$.prices[?(@.roomType == '4-bed' && @.roomClass == 'Standard')].deposit",
                        hasItem(1380000)))
                .andExpect(jsonPath("$.depositPercent").value(20))
                .andExpect(jsonPath("$.rooms[?(@.roomType == '2-bed' && @.roomClass == 'Basic' && @.gender == 'M')].beds",
                        hasItem(16)))
                .andExpect(jsonPath("$.houseRules").value("Quiet after 23:00."))
                .andExpect(jsonPath("$.faq[0].answer").value("No."));
        mvc.perform(get("/registration-periods/current").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_A)))
                .andExpect(status().isOk());

        String admin = bearer(mvc, ADMIN);
        String draft = JsonPath.read(mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .post("/admin/terms/drafts").header(HttpHeaders.AUTHORIZATION, admin)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Draft 2035\",\"stayStart\":\"2035-01-05\",\"stayEnd\":\"2035-04-25\"}"))
                .andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(get("/registration-periods/" + draft).header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isNotFound());
        mvc.perform(get("/registration-periods/current").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.card.places", greaterThan(0)));
    }
}
