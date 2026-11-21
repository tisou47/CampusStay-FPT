package vn.fpt.campusstay.regression;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;

/** Review findings BE-AUTH-02, BE-AUTH-03, BE-PLT-10: regression tests (each reproduced the finding before Wave 1 fixed it). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AuthRegressionIT {

    @Autowired
    MockMvc mvc;

    private int signIn(String ip, String email, String password) throws Exception {
        return mvc.perform(post("/auth/sign-in").with(r -> {
            r.setRemoteAddr(ip);
            return r;
        }).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"))
                .andReturn().getResponse().getStatus();
    }

    /** TC-AUTH-083 (Wave 1 regression): BE-AUTH-02: one client guessing passwords across many accounts is throttled (429) at some point. */
    @Test
    void beAuth02_signInIsRateLimitedPerClient() throws Exception {
        List<Integer> statuses = new ArrayList<>();
        for (int n = 1; n <= 40; n++) {
            statuses.add(signIn("203.0.113.7", RegressionSupport.student(n), "Guess" + n + "!x"));
        }
        assertThat(statuses).as("40 bad sign-ins from one IP across 40 accounts").contains(429);
    }

    /** TC-AUTH-084 (Wave 1 regression): BE-AUTH-02: a stranger's 5 wrong passwords must not lock the owner out (right password, other IP). */
    @Test
    void beAuth02_strangerCannotLockOutTheOwner() throws Exception {
        String email = TestAuth.MANAGER_B;
        for (int i = 0; i < 5; i++) {
            signIn("198.51.100.66", email, "Wrong12345");
        }
        assertThat(signIn("192.0.2.10", email, TestAuth.PASSWORD)).as("owner signs in from their own IP").isEqualTo(200);
    }

    /** TC-AUTH-085 (Wave 1 regression): BE-AUTH-03: anonymous forgot-password requests from one client across many accounts are throttled. */
    @Test
    void beAuth03_forgotPasswordIsRateLimitedPerClient() throws Exception {
        List<Integer> statuses = new ArrayList<>();
        for (int n = 1; n <= 40; n++) {
            statuses.add(mvc.perform(post("/auth/password/forgot").with(r -> {
                r.setRemoteAddr("203.0.113.8");
                return r;
            }).contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + RegressionSupport.student(n) + "\"}"))
                    .andReturn().getResponse().getStatus());
        }
        assertThat(statuses).as("40 reset requests from one IP").contains(429);
    }

    /** TC-AUTH-086 (Wave 1 regression): BE-PLT-10: a JSON endpoint called with a wrong content type answers 415/400, not 500 INTERNAL_ERROR. */
    @Test
    void bePlt10_wrongContentTypeIsAClientError() throws Exception {
        int status = mvc.perform(post("/auth/sign-in").contentType(MediaType.TEXT_PLAIN).content("email=a&password=b"))
                .andReturn().getResponse().getStatus();
        assertThat(status).isIn(400, 415);
    }
}
