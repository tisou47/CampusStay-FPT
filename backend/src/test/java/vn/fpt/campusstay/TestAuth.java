package vn.fpt.campusstay;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;

import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Sign-in helpers for integration tests (seed accounts share one password). */
public final class TestAuth {

    public static final String PASSWORD = "CampusStay@2026";
    public static final String ADMIN = "admin@campusstay.test";
    public static final String MANAGER_A = "manager.a@campusstay.test";
    public static final String MANAGER_B = "manager.b@campusstay.test";
    public static final String STAFF_A = "staff.a1@campusstay.test";
    /** Block B only, no handles; for Block-scope checks (Managers see every Block, ADR-19). */
    public static final String STAFF_B2 = "staff.b2@campusstay.test";
    public static final String STUDENT = "se190010@student.campusstay.test";

    private TestAuth() {
    }

    /** Signs in and returns the {@code Authorization} header value. */
    public static String bearer(MockMvc mvc, String email) throws Exception {
        return bearer(mvc, email, PASSWORD);
    }

    public static String bearer(MockMvc mvc, String email, String password) throws Exception {
        String body = mvc.perform(post("/auth/sign-in").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + JsonPath.read(body, "$.token");
    }
}
