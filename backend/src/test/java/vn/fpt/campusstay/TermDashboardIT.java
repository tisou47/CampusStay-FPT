package vn.fpt.campusstay;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.STUDENT;
import static vn.fpt.campusstay.TestAuth.bearer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Manager › Registration › Term dashboard (spec §11.3; TC-RPT-012). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class TermDashboardIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    /**
     * TC-RPT-012: the dashboard of a Term shows its milestones in order with their progress, its Applications by
     * status, the places per Room Type × Room Class × gender with the Term's prices, and the Deposits issued; Staff
     * cannot read it and an unknown Term is 404.
     */
    @Test
    void termDashboard() throws Exception {
        ApplyFlow flow = new ApplyFlow(mvc, jdbc);
        long term = flow.openTerm();
        flow.apply(bearer(mvc, STUDENT), "4-bed", "Standard", null);
        int beds = jdbc.sql("""
                SELECT count(*) FROM inv_bed b JOIN inv_room r ON r.id = b.room_id JOIN inv_building u ON u.id = r.building_id
                JOIN cfg_room_type t ON t.id = r.room_type_id JOIN cfg_room_class c ON c.id = r.room_class_id
                WHERE b.status = 'IN_SERVICE' AND r.status = 'IN_SERVICE' AND u.code = 'A'
                  AND t.name = '4-bed' AND c.name = 'Standard'
                """).query(Integer.class).single();
        String manager = bearer(mvc, MANAGER_B);
        mvc.perform(get("/dashboards/term").header(HttpHeaders.AUTHORIZATION, manager).param("termId", String.valueOf(term)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.term.id").value(String.valueOf(term)))
                .andExpect(jsonPath("$.term.status").value("Registration open"))
                .andExpect(jsonPath("$.terms[*].name", hasItem("Spring 2027")))
                .andExpect(jsonPath("$.milestones[0].key").value("registrationOpensAt"))
                .andExpect(jsonPath("$.milestones[0].done").value(true))
                .andExpect(jsonPath("$.milestones[1].key").value("registrationClosesAt"))
                .andExpect(jsonPath("$.applications[*].status", contains("Awaiting Deposit")))
                .andExpect(jsonPath("$.applicationsTotal").value(1))
                .andExpect(jsonPath("$.places[?(@.roomType == '4-bed' && @.roomClass == 'Standard' && @.gender == 'M')].beds",
                        contains(beds)))
                .andExpect(jsonPath("$.money.depositsIssued").value(1))
                .andExpect(jsonPath("$.money.depositsPaid").value(0));
        mvc.perform(get("/dashboards/term").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STAFF_A)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/dashboards/term").header(HttpHeaders.AUTHORIZATION, manager).param("termId", "999999"))
                .andExpect(status().isNotFound());
    }
}
