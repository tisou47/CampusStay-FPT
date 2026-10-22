package vn.fpt.campusstay;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Password reset (from the emailed link) and password change, against a real PostgreSQL.
 * The raw reset token is only in the email, so tests read it from the notification outbox row.
 * Each test uses its own seed account. Test case IDs follow TC-AUTH-NNN (Report 5).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)   // changes the passwords of seed accounts
class PasswordFlowIT {

    private static final String PASSWORD = "CampusStay@2026";
    private static final String NEW_PASSWORD = "Dormitory2027";
    private static final Pattern TOKEN = Pattern.compile("[?&]token=([A-Za-z0-9_-]+)");

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    /** TC-AUTH-022: reset sets the new password, the old one fails and every earlier session is signed out. */
    @Test
    void resetChangesPasswordAndRevokesSessions() throws Exception {
        String email = "se190010@student.campusstay.test";
        String before = signIn(email, PASSWORD);
        String token = requestResetToken(email);

        reset(token, NEW_PASSWORD).andExpect(status().isNoContent());

        signIn(email, NEW_PASSWORD);
        signInRequest(email, PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        mvc.perform(get("/auth/me").header("Authorization", "Bearer " + before))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    /** TC-AUTH-023 (negative): a reset link works only once. */
    @Test
    void resetLinkCannotBeReused() throws Exception {
        String email = "se190011@student.campusstay.test";
        String token = requestResetToken(email);
        reset(token, NEW_PASSWORD).andExpect(status().isNoContent());

        reset(token, "Another2028")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("LINK_INVALID"));
        signIn(email, NEW_PASSWORD);
    }

    /** TC-AUTH-024 (negative): a weak new password is refused and the link stays usable. */
    @Test
    void resetRejectsWeakPasswordAndKeepsLink() throws Exception {
        String email = "se190012@student.campusstay.test";
        String token = requestResetToken(email);

        reset(token, "Short1")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("WEAK_PASSWORD"));
        reset(token, "Se190012abc")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("WEAK_PASSWORD"));
        signIn(email, PASSWORD);

        reset(token, NEW_PASSWORD).andExpect(status().isNoContent());
        signIn(email, NEW_PASSWORD);
    }

    /** TC-AUTH-025 (negative): a wrong current password is a field error and changes nothing. */
    @Test
    void changeRejectsWrongCurrentPassword() throws Exception {
        String email = "se190013@student.campusstay.test";
        String session = signIn(email, PASSWORD);

        change(session, "Wrong12345", NEW_PASSWORD)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("WRONG_PASSWORD"))
                .andExpect(jsonPath("$.details.fields.currentPassword").exists());
        signIn(email, PASSWORD);
    }

    /** TC-AUTH-026: change keeps the current session, signs out the others and the new password works. */
    @Test
    void changeKeepsCurrentSessionAndRevokesOthers() throws Exception {
        String email = "se190014@student.campusstay.test";
        String current = signIn(email, PASSWORD);
        String other = signIn(email, PASSWORD);

        change(current, PASSWORD, NEW_PASSWORD).andExpect(status().isNoContent());

        mvc.perform(get("/auth/me").header("Authorization", "Bearer " + current))
                .andExpect(status().isOk());
        mvc.perform(get("/auth/me").header("Authorization", "Bearer " + other))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        signIn(email, NEW_PASSWORD);
    }

    /** TC-AUTH-027 (negative): change refuses a weak new password and keeps the old one. */
    @Test
    void changeRejectsWeakPassword() throws Exception {
        String email = "se190015@student.campusstay.test";
        String session = signIn(email, PASSWORD);

        change(session, PASSWORD, "Short1")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("WEAK_PASSWORD"));
        signIn(email, PASSWORD);
    }

    /** Asks for a reset link and reads the raw token from the email queued in the same transaction. */
    private String requestResetToken(String email) throws Exception {
        mvc.perform(post("/auth/password/forgot").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isNoContent());
        String body = jdbc.sql("SELECT body_html FROM ntf_email_outbox WHERE to_email = :to ORDER BY id DESC LIMIT 1")
                .param("to", email)
                .query(String.class)
                .single();
        Matcher m = TOKEN.matcher(body);
        if (!m.find()) {
            throw new AssertionError("No reset link in the queued email");
        }
        return m.group(1);
    }

    private ResultActions reset(String token, String newPassword) throws Exception {
        return mvc.perform(post("/auth/password/reset").contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\",\"newPassword\":\"" + newPassword + "\"}"));
    }

    private ResultActions change(String session, String currentPassword, String newPassword) throws Exception {
        return mvc.perform(post("/auth/password/change").header("Authorization", "Bearer " + session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"" + currentPassword + "\",\"newPassword\":\"" + newPassword + "\"}"));
    }

    private ResultActions signInRequest(String email, String password) throws Exception {
        return mvc.perform(post("/auth/sign-in").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"));
    }

    private String signIn(String email, String password) throws Exception {
        String body = signInRequest(email, password)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.token");
    }
}
