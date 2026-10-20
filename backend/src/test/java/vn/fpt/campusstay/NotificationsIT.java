package vn.fpt.campusstay;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
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

/** Notification Center (TC-NTF-NNN). Each test uses its own student so the unread counts do not mix. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class NotificationsIT {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    /** TC-NTF-001: newest first, with the unread count and string ids; {@code limit} caps the items. */
    @Test
    void listsLatestWithUnreadCount() throws Exception {
        String email = "se190020@student.campusstay.test";
        notify(email, "Pay your Deposit", "2026-10-20 03:00:00+00");
        notify(email, "Application submitted", "2026-10-21 03:00:00+00");
        String student = bearer(mvc, email);
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, student).param("limit", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[0].id").isString())
                .andExpect(jsonPath("$.items[0].title").value("Application submitted"))
                .andExpect(jsonPath("$.items[0].read").value(false))
                .andExpect(jsonPath("$.items[0].createdAt").value("2026-10-21T03:00:00Z"))
                .andExpect(jsonPath("$.unread").value(3));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.items[2].title").value("Welcome to CampusStay"))
                .andExpect(jsonPath("$.items[2].link").value("/student"));
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, student).param("limit", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_PARAMETER"));
    }

    /** TC-NTF-002: mark one read (twice is fine), then all; someone else's notification is 404. */
    @Test
    void marksReadOnlyOwnNotifications() throws Exception {
        String email = "se190021@student.campusstay.test";
        notify(email, "Invoice overdue", "2026-10-21 04:00:00+00");
        String student = bearer(mvc, email);
        long own = jdbc.sql("""
                SELECT n.id FROM ntf_notification n JOIN auth_user u ON u.id = n.user_id
                WHERE u.email = :email AND n.title = 'Invoice overdue'
                """).param("email", email).query(Long.class).single();
        long others = jdbc.sql("""
                SELECT n.id FROM ntf_notification n JOIN auth_user u ON u.id = n.user_id
                WHERE u.email = 'admin@campusstay.test' LIMIT 1
                """).query(Long.class).single();

        mvc.perform(post("/notifications/" + own + "/read").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isNoContent());
        mvc.perform(post("/notifications/" + own + "/read").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isNoContent());
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.items[0].read").value(true))
                .andExpect(jsonPath("$.unread").value(1));
        mvc.perform(post("/notifications/" + others + "/read").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isNotFound());
        mvc.perform(post("/notifications/read-all").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(status().isNoContent());
        mvc.perform(get("/notifications").header(HttpHeaders.AUTHORIZATION, student))
                .andExpect(jsonPath("$.unread").value(0));
    }

    /** TC-NTF-003 (negative): signed-in users only. */
    @Test
    void requiresSignIn() throws Exception {
        mvc.perform(get("/notifications")).andExpect(status().isUnauthorized());
    }

    private void notify(String email, String title, String createdAt) {
        jdbc.sql("""
                INSERT INTO ntf_notification (user_id, event_key, title, body, created_at)
                SELECT id, 'TEST', :title, 'Body', CAST(:at AS timestamptz) FROM auth_user WHERE email = :email
                """).param("title", title).param("at", createdAt).param("email", email).update();
    }
}
