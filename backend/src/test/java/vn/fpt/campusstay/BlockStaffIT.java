package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
import static vn.fpt.campusstay.TestAuth.MANAGER_B;
import static vn.fpt.campusstay.TestAuth.STAFF_A;
import static vn.fpt.campusstay.TestAuth.bearer;

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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Block Manager › Staff: who works in the Block, what they handle, duty, account requests (TC-AUTH-019…021). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BlockStaffIT {

    private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 'I', 'H',
            'D', 'R' };
    private static final String STAFF_A2 = "staff.a2@campusstay.test";
    private static final String STAFF_AB = "staff.ab@campusstay.test";
    /** Only its id is used: AuthFlowIT locks this account. */
    private static final String STAFF_B1 = "staff.b1@campusstay.test";

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

    private ResultActions list(String auth) throws Exception {
        return mvc.perform(get("/block-staff").header(HttpHeaders.AUTHORIZATION, auth));
    }

    private ResultActions update(String auth, long userId, String body) throws Exception {
        return mvc.perform(put("/block-staff/" + userId).header(HttpHeaders.AUTHORIZATION, auth)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String person(String name) {
        return "$.items[?(@.name == '" + name + "')]";
    }

    /** TC-AUTH-019: the Block's staff with titles, handles, Blocks, open work and duty; the summary. */
    @Test
    void listsTheBlocksStaff() throws Exception {
        stay.livesIn(1, "A-201", "A", true);
        String code = JsonPath.read(mvc.perform(multipart("/maintenance-requests")
                .file(new MockMultipartFile("photos", "leak.png", "image/png", PNG))
                .param("title", "Door lock is stuck").param("description", "The key turns but the lock stays shut.")
                .param("location", "Room").param("category", "Furniture").param("urgency", "Normal")
                .param("staffMayEnter", "true").header(HttpHeaders.AUTHORIZATION, bearer(mvc, StayFlow.student(1))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.id");
        jdbc.sql("UPDATE mnt_request SET assignee_id = :a, status = 'ASSIGNED' WHERE code = :c")
                .param("a", stay.userId(STAFF_A2)).param("c", code).update();

        list(bearer(mvc, MANAGER_A)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(4)))
                .andExpect(jsonPath(person("Nguyen Van Binh") + ".title").value(hasItem("Residence Life Officer")))
                .andExpect(jsonPath(person("Nguyen Van Binh") + ".handles[*]").value(
                        contains("Desk (Check-in / Check-out)", "Applications", "Room changes and swaps")))
                .andExpect(jsonPath(person("Huynh Gia Bao") + ".blocks[*]").value(contains("A", "B")))
                .andExpect(jsonPath(person("Vo Thanh Tung") + ".open").value(hasItem(1)))
                .andExpect(jsonPath(person("Le Hoang Nam") + ".onDuty").value(hasItem(false)))
                .andExpect(jsonPath("$.summary.total").value(4))
                .andExpect(jsonPath("$.summary.shared").value(1))
                .andExpect(jsonPath("$.summary.onDuty").value(3))
                .andExpect(jsonPath("$.summary.deskOnDuty").value(1))
                .andExpect(jsonPath("$.summary.averageOpen").value(0.3))
                .andExpect(jsonPath("$.handleOptions", hasSize(7)))
                .andExpect(jsonPath("$.roleOptions", contains("Staff", "Manager")));

        list(bearer(mvc, STAFF_A)).andExpect(status().isForbidden());
        mvc.perform(get("/block-staff").param("block", "B").header(HttpHeaders.AUTHORIZATION, bearer(mvc, MANAGER_A)))
                .andExpect(status().isForbidden());
    }

    /** TC-AUTH-020: the Manager sets what a person handles and their duty; only staff who share a Block. */
    @Test
    void updatesHandlesAndDuty() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        long ab = stay.userId(STAFF_AB);
        update(manager, ab, "{\"handles\":[\"Payments\",\"Meter readings\"],\"onDuty\":false}")
                .andExpect(status().isNoContent());
        list(manager).andExpect(jsonPath(person("Huynh Gia Bao") + ".handles[*]").value(contains("Payments",
                "Meter readings")))
                .andExpect(jsonPath(person("Huynh Gia Bao") + ".onDuty").value(hasItem(false)));
        update(manager, ab, "{\"onDuty\":true}").andExpect(status().isNoContent());
        list(manager).andExpect(jsonPath(person("Huynh Gia Bao") + ".handles[*]").value(contains("Payments",
                "Meter readings")))
                .andExpect(jsonPath(person("Huynh Gia Bao") + ".onDuty").value(hasItem(true)));
        mvc.perform(get("/admin/audit-log").param("action", "Staff profile updated")
                .header(HttpHeaders.AUTHORIZATION, bearer(mvc, ADMIN)))
                .andExpect(jsonPath("$.items", hasSize(2)));

        update(manager, ab, "{\"handles\":[\"Cooking\"]}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.handles").exists());
        update(manager, stay.userId(STAFF_B1), "{\"onDuty\":true}").andExpect(status().isNotFound());
        update(bearer(mvc, MANAGER_B), stay.userId(STAFF_A), "{\"onDuty\":false}").andExpect(status().isNotFound());
        update(bearer(mvc, STAFF_A), ab, "{\"onDuty\":false}").andExpect(status().isForbidden());
    }

    /** TC-AUTH-021: the Manager asks Admin for a new account in the Block; one waiting request per email. */
    @Test
    void requestsANewAccount() throws Exception {
        String manager = bearer(mvc, MANAGER_A);
        String body = "{\"name\":\"Tran Van Moi\",\"email\":\"Moi.TV@fpt.edu.vn\",\"role\":\"Staff\"}";
        String id = JsonPath.read(stay.postJson("/staff-account-requests", manager, body).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "$.id");
        assertThat(jdbc.sql("""
                SELECT b.code || ' ' || r.email || ' ' || r.role || ' ' || r.status
                FROM auth_staff_account_request r JOIN inv_building b ON b.id = r.building_id WHERE r.id = :id
                """).param("id", Long.parseLong(id)).query(String.class).single())
                .isEqualTo("A moi.tv@fpt.edu.vn STAFF PENDING");

        stay.postJson("/staff-account-requests", manager, body).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.email").exists());
        stay.postJson("/staff-account-requests", manager,
                "{\"name\":\"Le Thi Hoa\",\"email\":\"hoa@gmail.com\",\"role\":\"Admin\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.email").exists())
                .andExpect(jsonPath("$.details.fields.role").exists());
        stay.postJson("/staff-account-requests", bearer(mvc, STAFF_A), body).andExpect(status().isForbidden());
    }
}
