package vn.fpt.campusstay;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.emptyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * End-to-end Auth flow against a real PostgreSQL with the Flyway schema and dev seed.
 * Test case IDs follow TC-AUTH-NNN (Report 5).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
class AuthFlowIT {

    private static final String PASSWORD = "CampusStay@2026";

    @Autowired
    MockMvc mvc;

    /** TC-AUTH-001: valid credentials return a token and the contract user shape. */
    @Test
    void signInReturnsTokenAndUser() throws Exception {
        mvc.perform(post("/auth/sign-in").contentType(MediaType.APPLICATION_JSON)
                .content(json("manager.a@campusstay.test", PASSWORD, false)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value(not(emptyString())))
                .andExpect(jsonPath("$.user.id").isString())
                .andExpect(jsonPath("$.user.role").value("manager"))
                .andExpect(jsonPath("$.user.blocks[0]").value("A"))
                .andExpect(jsonPath("$.user.studentCode").doesNotExist());
    }

    /** TC-AUTH-002: wrong password and unknown email get the same generic answer. */
    @Test
    void wrongPasswordAndUnknownEmailLookTheSame() throws Exception {
        mvc.perform(post("/auth/sign-in").contentType(MediaType.APPLICATION_JSON)
                .content(json("admin@campusstay.test", "Wrong12345", false)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
        mvc.perform(post("/auth/sign-in").contentType(MediaType.APPLICATION_JSON)
                .content(json("nobody@campusstay.test", "Wrong12345", false)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
                .andExpect(jsonPath("$.message").value("Email or password is incorrect."));
    }

    /** TC-AUTH-003: me works with the token; after sign-out the same token gets 401. */
    @Test
    void signOutRevokesToken() throws Exception {
        String token = signIn("se190002@student.campusstay.test");
        mvc.perform(get("/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.role").value("student"))
                .andExpect(jsonPath("$.studentCode").value("SE190002"));
        mvc.perform(post("/auth/sign-out").header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());
        mvc.perform(get("/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    }

    /** TC-AUTH-004: no token → 401; a student calling an Admin endpoint → 403. */
    @Test
    void roleRulesAreEnforced() throws Exception {
        mvc.perform(get("/auth/me")).andExpect(status().isUnauthorized());
        String token = signIn("se190003@student.campusstay.test");
        mvc.perform(get("/admin/terms").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    /** TC-AUTH-005 (boundary): the 5th wrong password locks the account, even for the right password. */
    @Test
    void accountLocksAfterMaxFailedAttempts() throws Exception {
        String email = "staff.b1@campusstay.test";
        for (int i = 0; i < 5; i++) {
            mvc.perform(post("/auth/sign-in").contentType(MediaType.APPLICATION_JSON)
                    .content(json(email, "Wrong12345", false)))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/auth/sign-in").contentType(MediaType.APPLICATION_JSON)
                .content(json(email, PASSWORD, false)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("ACCOUNT_LOCKED"));
    }

    /** TC-AUTH-006 (negative): body validation returns field messages. */
    @Test
    void invalidBodyReturnsFieldErrors() throws Exception {
        mvc.perform(post("/auth/sign-in").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"not-an-email\",\"password\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.details.fields.email").exists())
                .andExpect(jsonPath("$.details.fields.password").exists());
    }

    /** TC-CFG-001: published Terms with string ids, ISO dates and the list total. */
    @Test
    void termsAreListed() throws Exception {
        String token = signIn("se190004@student.campusstay.test");
        mvc.perform(get("/terms").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[0].id").isString())
                .andExpect(jsonPath("$.items[0].name").value("Spring 2027"))
                .andExpect(jsonPath("$.items[0].stayStart").value("2027-01-04"))
                .andExpect(jsonPath("$.items[0].depositWindowHours").value(48));
    }

    /** TC-AUTH-007: forgot password never reveals whether the email exists. */
    @Test
    void forgotPasswordIsSilent() throws Exception {
        mvc.perform(post("/auth/password/forgot").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"nobody@campusstay.test\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(post("/auth/password/forgot").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"se190005@student.campusstay.test\"}"))
                .andExpect(status().isNoContent());
    }

    /** TC-AUTH-008: "remember" may be left out (Jackson 3 would reject a missing primitive). */
    @Test
    void rememberIsOptional() throws Exception {
        mvc.perform(post("/auth/sign-in").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"se190006@student.campusstay.test\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value(not(emptyString())));
    }

    /** TC-AUTH-009 (negative): Google sign-in needs exactly one of code and credential. */
    @Test
    void googleNeedsExactlyOneOfCodeAndCredential() throws Exception {
        for (String body : new String[] { "{\"remember\":true}", "{\"code\":\"c\",\"credential\":\"t\"}" }) {
            mvc.perform(post("/auth/google").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                    .andExpect(jsonPath("$.details.fields.code").exists());
        }
    }

    /** TC-AUTH-010: without Google configuration both flows answer 503 GOOGLE_SIGN_IN_DISABLED. */
    @Test
    void googleDisabledWithoutConfiguration() throws Exception {
        for (String body : new String[] { "{\"code\":\"c\"}", "{\"credential\":\"t\"}" }) {
            mvc.perform(post("/auth/google").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.code").value("GOOGLE_SIGN_IN_DISABLED"));
        }
    }

    private String signIn(String email) throws Exception {
        String body = mvc.perform(post("/auth/sign-in").contentType(MediaType.APPLICATION_JSON)
                .content(json(email, PASSWORD, false)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.token");
    }

    private static String json(String email, String password, boolean remember) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\",\"remember\":" + remember + "}";
    }
}
