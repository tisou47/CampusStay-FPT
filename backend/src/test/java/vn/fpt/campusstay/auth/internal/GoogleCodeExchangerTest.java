package vn.fpt.campusstay.auth.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import vn.fpt.campusstay.shared.error.ApiException;

/** Google authorization-code exchange (ADR-14). Test case IDs follow TC-AUTH-NNN (Report 5). */
class GoogleCodeExchangerTest {

    private static final String TOKEN_URI = "https://oauth2.test/token";

    private MockRestServiceServer server;

    private GoogleCodeExchanger exchanger(String clientId, String clientSecret) {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        var google = new AuthProperties.Google(clientId, clientSecret, "fpt.edu.vn", "https://jwks.test", TOKEN_URI);
        var props = new AuthProperties(null, null, null, null, 0, null, null, null, 0, null, google);
        return new GoogleCodeExchanger(props, builder);
    }

    /** TC-AUTH-011: the code is posted with the popup redirect URI and the ID token is returned. */
    @Test
    void exchangesCodeForIdToken() {
        GoogleCodeExchanger exchanger = exchanger("client-1", "secret-1");
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("code", "code-1");
        form.add("client_id", "client-1");
        form.add("client_secret", "secret-1");
        form.add("redirect_uri", "postmessage");
        server.expect(requestTo(TOKEN_URI))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().formData(form))
                .andRespond(withSuccess("{\"access_token\":\"a\",\"id_token\":\"id-token-1\",\"expires_in\":3599}",
                        MediaType.APPLICATION_JSON));

        assertThat(exchanger.exchange("code-1")).isEqualTo("id-token-1");
        server.verify();
    }

    /** TC-AUTH-012 (negative): a used or expired code is the user's retryable error (401). */
    @Test
    void usedCodeIsInvalid() {
        GoogleCodeExchanger exchanger = exchanger("client-1", "secret-1");
        server.expect(requestTo(TOKEN_URI)).andRespond(withBadRequest()
                .body("{\"error\":\"invalid_grant\",\"error_description\":\"Bad Request\"}")
                .contentType(MediaType.APPLICATION_JSON));

        assertError(() -> exchanger.exchange("code-1"), HttpStatus.UNAUTHORIZED, "GOOGLE_TOKEN_INVALID");
    }

    /** TC-AUTH-013 (negative): a wrong client secret is our misconfiguration, not the user's (503). */
    @Test
    void wrongClientSecretIsUnavailable() {
        GoogleCodeExchanger exchanger = exchanger("client-1", "wrong-secret");
        server.expect(requestTo(TOKEN_URI)).andRespond(withStatus(HttpStatus.UNAUTHORIZED)
                .body("{\"error\":\"invalid_client\",\"error_description\":\"Unauthorized\"}")
                .contentType(MediaType.APPLICATION_JSON));

        assertError(() -> exchanger.exchange("code-1"), HttpStatus.SERVICE_UNAVAILABLE, "GOOGLE_UNAVAILABLE");
    }

    /** TC-AUTH-014 (negative): Google cannot be reached (503). */
    @Test
    void networkFailureIsUnavailable() {
        GoogleCodeExchanger exchanger = exchanger("client-1", "secret-1");
        server.expect(requestTo(TOKEN_URI)).andRespond(withException(new IOException("connection refused")));

        assertError(() -> exchanger.exchange("code-1"), HttpStatus.SERVICE_UNAVAILABLE, "GOOGLE_UNAVAILABLE");
    }

    /** TC-AUTH-015 (boundary): without a client secret the code flow is off and Google is never called. */
    @Test
    void codeFlowNeedsClientSecret() {
        GoogleCodeExchanger exchanger = exchanger("client-1", "");

        assertError(() -> exchanger.exchange("code-1"), HttpStatus.SERVICE_UNAVAILABLE, "GOOGLE_SIGN_IN_DISABLED");
        server.verify();
    }

    private static void assertError(Runnable call, HttpStatus status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.status()).isEqualTo(status);
            assertThat(e.code()).isEqualTo(code);
        });
    }
}
