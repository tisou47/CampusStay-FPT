package vn.fpt.campusstay.ntf.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import tools.jackson.databind.json.JsonMapper;

/** FCM HTTP v1 sender against a mock Google (TC-NTF-010…012). */
class FcmPushSenderTest {

    private static final String SEND = "https://fcm.googleapis.com/v1/projects/campusstay-test/messages:send";
    private static final String TOKEN_URI = "https://oauth2.example.test/token";

    private final JsonMapper json = JsonMapper.builder().build();
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-21T03:00:00Z"), ZoneOffset.UTC);
    private KeyPair keys;
    private MockRestServiceServer server;
    private FcmPushSender sender;

    @BeforeEach
    void setUp() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        keys = generator.generateKeyPair();
        String pem = "-----BEGIN PRIVATE KEY-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.UTF_8)).encodeToString(keys.getPrivate().getEncoded())
                + "\n-----END PRIVATE KEY-----\n";
        String credentials = json.writeValueAsString(Map.of("type", "service_account", "project_id",
                "campusstay-test", "client_email", "push@campusstay-test.iam.gserviceaccount.com", "private_key", pem,
                "token_uri", TOKEN_URI));
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        sender = new FcmPushSender(credentials, builder, json, clock);
    }

    /** TC-NTF-010: a signed service-account JWT buys an access token; the message goes to the device. */
    @Test
    void sendsWithAccessToken() {
        server.expect(requestTo(TOKEN_URI)).andExpect(method(HttpMethod.POST))
                .andExpect(content().string(Matchers.containsString(
                        "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer")))
                .andRespond(withSuccess("{\"access_token\":\"at-1\",\"expires_in\":3600}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEND)).andExpect(header("Authorization", "Bearer at-1"))
                .andExpect(jsonPath("$.message.token").value("device-1"))
                .andExpect(jsonPath("$.message.notification.title").value("Your room is ready"))
                .andExpect(jsonPath("$.message.data.link").value("/student/room"))
                .andRespond(withSuccess("{\"name\":\"projects/x/messages/1\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEND)).andExpect(header("Authorization", "Bearer at-1"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        assertThat(sender.send("device-1", "Your room is ready", "Room A-301", "/student/room"))
                .isEqualTo(PushSender.Outcome.SENT);
        // The access token is cached: the second message needs no new token.
        assertThat(sender.send("device-2", "Payment received", "We received 1,000 VND", null))
                .isEqualTo(PushSender.Outcome.SENT);
        server.verify();
    }

    /** TC-NTF-011: an unregistered device token is reported so it can be disabled; other errors are failures. */
    @Test
    void invalidTokenAndFailure() {
        server.expect(requestTo(TOKEN_URI))
                .andRespond(withSuccess("{\"access_token\":\"at-1\",\"expires_in\":3600}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(SEND)).andRespond(withStatus(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON)
                .body("{\"error\":{\"status\":\"NOT_FOUND\",\"details\":[{\"errorCode\":\"UNREGISTERED\"}]}}"));
        server.expect(requestTo(SEND)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThat(sender.send("gone", "t", "b", null)).isEqualTo(PushSender.Outcome.INVALID_TOKEN);
        assertThat(sender.send("device", "t", "b", null)).isEqualTo(PushSender.Outcome.FAILED);
        server.verify();
    }

    /** TC-NTF-012: the JWT is RS256-signed with the service account key and names the FCM scope. */
    @Test
    void assertionIsSigned() throws Exception {
        String jwt = sender.assertion(TOKEN_URI, clock.instant());
        String[] parts = jwt.split("\\.");
        assertThat(parts).hasSize(3);
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(keys.getPublic());
        verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.UTF_8));
        assertThat(verifier.verify(Base64.getUrlDecoder().decode(parts[2]))).isTrue();
        String claims = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
        assertThat(claims).contains("\"scope\":\"" + FcmPushSender.SCOPE + "\"").contains("\"aud\":\"" + TOKEN_URI + "\"")
                .contains("\"iss\":\"push@campusstay-test.iam.gserviceaccount.com\"");
    }
}
