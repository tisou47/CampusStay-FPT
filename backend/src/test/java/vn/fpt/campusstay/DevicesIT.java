package vn.fpt.campusstay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static vn.fpt.campusstay.TestAuth.bearer;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
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

import vn.fpt.campusstay.ntf.internal.TestPushSenders;
import vn.fpt.campusstay.shared.security.Tokens;

/** FCM device tokens and push after commit (TC-NTF-020, 021); FCM itself is a recording stand-in. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({ PostgresTestcontainer.class, TestPushSenders.Recording.class })
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DevicesIT {

    private static final List<TestPushSenders.Push> SENT = TestPushSenders.SENT;

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    ApplyFlow flow;

    @BeforeEach
    void openTerm() {
        flow = new ApplyFlow(mvc, jdbc);
        flow.openTerm();
        SENT.clear();
    }

    private ResultActions postJson(String path, String auth, String body) throws Exception {
        var request = post(path).contentType(MediaType.APPLICATION_JSON).content(body);
        if (auth != null) {
            request.header(HttpHeaders.AUTHORIZATION, auth);
        }
        return mvc.perform(request);
    }

    private long devices(String token, boolean active) {
        return jdbc.sql("SELECT count(*) FROM ntf_device WHERE token_hash = :h" + (active ? " AND disabled_at IS NULL" : ""))
                .param("h", Tokens.sha256Hex(token)).query(Long.class).single();
    }

    private void awaitPush(int count) throws InterruptedException {
        Instant until = Instant.now().plus(Duration.ofSeconds(5));
        while (SENT.size() < count && Instant.now().isBefore(until)) {
            Thread.sleep(50);
        }
    }

    /** TC-NTF-020: register, register again, unregister; the token is stored by hash and validated. */
    @Test
    void registerAndUnregister() throws Exception {
        String auth = bearer(mvc, "se190020@student.campusstay.test");
        postJson("/devices", null, "{\"token\":\"tok-1\",\"platform\":\"android\"}").andExpect(status().isUnauthorized());
        postJson("/devices", auth, "{\"platform\":\"android\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.token").isString());
        postJson("/devices", auth, "{\"token\":\"tok-1\",\"platform\":\"ios\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.fields.platform").isString());
        postJson("/devices", auth, "{\"token\":\"tok-1\",\"platform\":\"android\"}").andExpect(status().isNoContent());
        postJson("/devices", auth, "{\"token\":\"tok-1\",\"platform\":\"android\"}").andExpect(status().isNoContent());
        assertThat(devices("tok-1", true)).isEqualTo(1);

        postJson("/devices/unregister", bearer(mvc, "se190021@student.campusstay.test"), "{\"token\":\"tok-1\"}")
                .andExpect(status().isNoContent());
        assertThat(devices("tok-1", false)).isEqualTo(1);
        postJson("/devices/unregister", auth, "{\"token\":\"tok-1\"}").andExpect(status().isNoContent());
        assertThat(devices("tok-1", false)).isZero();
    }

    /** TC-NTF-021: a notification is pushed to the user's devices after commit; an expired token is disabled. */
    @Test
    void pushAfterCommit() throws Exception {
        String auth = bearer(mvc, "se190022@student.campusstay.test");
        postJson("/devices", auth, "{\"token\":\"phone\",\"platform\":\"android\"}").andExpect(status().isNoContent());
        postJson("/devices", auth, "{\"token\":\"expired\",\"platform\":\"android\"}").andExpect(status().isNoContent());

        ApplyFlow.Applied app = flow.apply(auth, "2-bed", "Standard", "{\"mode\":\"auto\"}");
        awaitPush(2);
        assertThat(SENT).extracting(TestPushSenders.Push::token).containsExactlyInAnyOrder("phone", "expired");
        assertThat(SENT).allSatisfy(p -> {
            assertThat(p.title()).isEqualTo("Pay your Deposit");
            assertThat(p.link()).isEqualTo("/student/invoices/" + app.depositInvoiceId() + "/pay");
        });
        Instant until = Instant.now().plus(Duration.ofSeconds(5));
        while (devices("expired", true) > 0 && Instant.now().isBefore(until)) {
            Thread.sleep(50);
        }
        assertThat(devices("expired", true)).isZero();
        assertThat(devices("phone", true)).isEqualTo(1);
    }
}
