package vn.fpt.campusstay;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.ADMIN;
import static vn.fpt.campusstay.TestAuth.MANAGER_A;
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
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

/**
 * Announcements and the students' board (spec §6.5, §10, D-08; TC-NTF-041…043): written by hand for an audience,
 * shown on the board and in the bell with a read state per student, and written by the system for every money or
 * policy change.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AnnouncementIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    private ResultActions send(String method, String path, String auth, String json) throws Exception {
        var builder = method.equals("PUT") ? put(path) : post(path);
        return mvc.perform(builder.header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    /** The test seed's Fall 2026 is in stay: the student holds a Bed in it. */
    private void livesIn(int n, String room) {
        long term = jdbc.sql("SELECT id FROM cfg_term WHERE code = 'FA26'").query(Long.class).single();
        new StayFlow(mvc, jdbc, new ApplyFlow(mvc, jdbc), term).livesIn(n, room, "A", true);
    }

    /**
     * TC-NTF-041: the Admin writes a pinned announcement for all students; a student reads it at the top of the board
     * and in the bell, unread; marking it read in the bell (id {@code ann-…}) updates both; the Admin sees one read.
     */
    @Test
    void adminAnnouncesToEveryStudent() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String id = JsonPath.read(send("POST", "/announcements", admin, """
                {"category":"Operations","audience":"All students","title":"Water off on Saturday",
                 "body":"The water is off from 08:00 to 12:00 for repairs.","pinned":true}""")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        String student = bearer(mvc, STUDENT);
        String board = mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value("ann-" + id))
                .andExpect(jsonPath("$.items[0].category").value("Operations"))
                .andExpect(jsonPath("$.items[0].title").value("Water off on Saturday"))
                .andExpect(jsonPath("$.items[0].read").value(false))
                .andReturn().getResponse().getContentAsString();
        int unread = JsonPath.read(board, "$.unread");
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, student).header("Accept-Language", "vi"))
                .andExpect(jsonPath("$.items[0].title").value("Water off on Saturday"));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.items[?(@.id == 'ann-" + id + "')].kind", contains("announcement")))
                .andExpect(jsonPath("$.items[?(@.id == 'ann-" + id + "')].read", contains(false)));
        mvc.perform(post("/notifications/ann-" + id + "/read").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isNoContent());
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.items[0].read").value(true))
                .andExpect(jsonPath("$.unread").value(unread - 1));
        mvc.perform(post("/notifications/ann-999999/read").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isNotFound());
        mvc.perform(get("/announcements").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.items[0].audience").value("All students"))
                .andExpect(jsonPath("$.items[0].reads").value(1))
                .andExpect(jsonPath("$.items[0].active").value(true));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, admin))
                .andExpect(jsonPath("$.items[*].id", not(hasItem("ann-" + id))));
    }

    /**
     * TC-NTF-042: Staff write only to the residents of their Blocks: everybody or another Block is refused; the
     * residents of the Block read it and other students do not; Staff end their own announcement; students cannot
     * write one.
     */
    @Test
    void staffAnnounceToTheirBlocks() throws Exception {
        String staff = bearer(mvc, STAFF_A);
        mvc.perform(get("/announcements/options").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.audiences", contains("Residents of Blocks")))
                .andExpect(jsonPath("$.blocks", contains("A")));
        String body = """
                {"category":"Operations","audience":"%s","blocks":["%s"],"title":"Fire drill",
                 "body":"Fire drill in Block A on Monday at 07:00."}""";
        send("POST", "/announcements", staff, body.formatted("All students", "A"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.audience").value("Staff write to the residents of their Blocks only."));
        send("POST", "/announcements", staff, body.formatted("Residents of Blocks", "B"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("BLOCK_OUT_OF_SCOPE"));
        String id = JsonPath.read(send("POST", "/announcements", staff, body.formatted("Residents of Blocks", "A"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");

        livesIn(10, "A-102");
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STUDENT)))
                .andExpect(jsonPath("$.items[*].title", hasItem("Fire drill")));
        String other = bearer(mvc, StayFlow.student(11));
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, other))
                .andExpect(jsonPath("$.items[*].title", not(hasItem("Fire drill"))));
        send("POST", "/announcements", other, body.formatted("All students", "A")).andExpect(status().isForbidden());

        send("PUT", "/announcements/" + id, staff, "{\"end\":true}").andExpect(status().isNoContent());
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, bearer(mvc, STUDENT)))
                .andExpect(jsonPath("$.items[*].title", not(hasItem("Fire drill"))));
        mvc.perform(get("/announcements").header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(jsonPath("$.items[?(@.id == '" + id + "')].active", contains(false)));
    }

    /**
     * TC-NTF-043: a change of the Deposit (Admin) and of a Block's settings (Manager) become change announcements with
     * the old and new values, in both languages; a Block's change reaches only its residents.
     */
    @Test
    void policyChangesAreAnnounced() throws Exception {
        String admin = bearer(mvc, ADMIN);
        String fees = mvc.perform(get("/admin/fees").header(HttpHeaders.AUTHORIZATION, admin)).andReturn().getResponse()
                .getContentAsString();
        send("PUT", "/admin/fees", admin, fees.replace("\"depositPercent\":20", "\"depositPercent\":25"))
                .andExpect(status().isOk());
        String student = bearer(mvc, StayFlow.student(12));
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.items[0].title").value("Changed: Deposit and refunds"))
                .andExpect(jsonPath("$.items[0].category").value("Finance"))
                .andExpect(jsonPath("$.items[0].changes[0].field").value("Deposit"))
                .andExpect(jsonPath("$.items[0].changes[0].before").value("20"))
                .andExpect(jsonPath("$.items[0].changes[0].after").value("25"));
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, student).header("Accept-Language", "vi"))
                .andExpect(jsonPath("$.items[0].title").value("Thay đổi: Tiền cọc và hoàn tiền"))
                .andExpect(jsonPath("$.items[0].body").value("Tiền cọc và hoàn tiền đã thay đổi:\n• Tiền cọc: 20% → 25%"));

        livesIn(13, "A-103");
        send("PUT", "/block-settings", bearer(mvc, MANAGER_A), """
                {"block":"A","deskOpens":"07:00","deskCloses":"21:30","visitFrom":"08:00","visitUntil":"22:00",
                 "quiet":"23:30","houseRules":"No guests overnight."}""").andExpect(status().isOk());
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, bearer(mvc, StayFlow.student(13))))
                .andExpect(jsonPath("$.items[0].title").value("Changed: Block A settings"))
                .andExpect(jsonPath("$.items[0].category").value("Operations"));
        mvc.perform(get("/students/me/board").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.items[*].title", not(hasItem("Changed: Block A settings"))));
    }
}
