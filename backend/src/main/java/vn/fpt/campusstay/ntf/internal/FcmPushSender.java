package vn.fpt.campusstay.ntf.internal;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import tools.jackson.databind.json.JsonMapper;

/**
 * FCM HTTP v1 with a Firebase service account: a self-signed JWT (RS256) is
 * exchanged for an access token, which is cached until shortly before it
 * expires. Device tokens are never logged.
 */
class FcmPushSender implements PushSender {

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ServiceAccount(@JsonProperty("project_id") String projectId,
            @JsonProperty("client_email") String clientEmail, @JsonProperty("private_key") String privateKey,
            @JsonProperty("token_uri") String tokenUri) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record TokenResponse(@JsonProperty("access_token") String accessToken, @JsonProperty("expires_in") long expiresIn) {
    }

    static final String SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
    private static final Logger log = LoggerFactory.getLogger(FcmPushSender.class);

    private final ServiceAccount account;
    private final PrivateKey key;
    private final RestClient http;
    private final JsonMapper json;
    private final String sendUri;
    private final Clock clock;
    private String accessToken;
    private Instant accessTokenExpires = Instant.EPOCH;

    FcmPushSender(String credentialsJson, RestClient.Builder builder, JsonMapper json, Clock clock) {
        this.json = json;
        this.account = json.readValue(credentialsJson, ServiceAccount.class);
        if (account.projectId() == null || account.clientEmail() == null || account.privateKey() == null) {
            throw new IllegalStateException("The Firebase credentials file is not a service account key");
        }
        this.key = privateKey(account.privateKey());
        this.http = builder.build();
        this.sendUri = "https://fcm.googleapis.com/v1/projects/" + account.projectId() + "/messages:send";
        this.clock = clock;
    }

    @Override
    public Outcome send(String token, String title, String body, String link) {
        Map<String, Object> message = Map.of("message", Map.of("token", token,
                "notification", Map.of("title", title, "body", body),
                "data", link == null ? Map.of() : Map.of("link", link),
                "android", Map.of("priority", "HIGH")));
        try {
            http.post().uri(sendUri).header("Authorization", "Bearer " + accessToken())
                    .contentType(MediaType.APPLICATION_JSON).body(json.writeValueAsString(message))
                    .retrieve().toBodilessEntity();
            return Outcome.SENT;
        } catch (RestClientResponseException e) {
            String error = e.getResponseBodyAsString();
            if (e.getStatusCode().value() == 404 || error.contains("UNREGISTERED")
                    || (e.getStatusCode().value() == 400 && error.contains("INVALID_ARGUMENT") && error.contains("token"))) {
                return Outcome.INVALID_TOKEN;
            }
            if (e.getStatusCode().value() == 401) {
                synchronized (this) {
                    accessTokenExpires = Instant.EPOCH;
                }
            }
            log.warn("FCM answered HTTP {} for a push message", e.getStatusCode().value());
            return Outcome.FAILED;
        } catch (RestClientException | IllegalStateException e) {
            log.warn("FCM push failed: {}", e.getMessage());
            return Outcome.FAILED;
        }
    }

    private synchronized String accessToken() {
        Instant now = Instant.now(clock);
        if (accessToken != null && now.isBefore(accessTokenExpires.minusSeconds(60))) {
            return accessToken;
        }
        String tokenUri = account.tokenUri() == null ? "https://oauth2.googleapis.com/token" : account.tokenUri();
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
        form.add("assertion", assertion(tokenUri, now));
        TokenResponse response = http.post().uri(tokenUri).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form).retrieve().body(TokenResponse.class);
        if (response == null || response.accessToken() == null) {
            throw new IllegalStateException("Google answered without an access token");
        }
        accessToken = response.accessToken();
        accessTokenExpires = now.plusSeconds(response.expiresIn() > 0 ? response.expiresIn() : 3600);
        return accessToken;
    }

    /** The signed JWT the token endpoint expects from a service account. */
    String assertion(String audience, Instant now) {
        Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
        String header = b64.encodeToString("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String claims = b64.encodeToString(json.writeValueAsString(Map.of("iss", account.clientEmail(), "scope", SCOPE,
                "aud", audience, "iat", now.getEpochSecond(), "exp", now.getEpochSecond() + 3600))
                .getBytes(StandardCharsets.UTF_8));
        try {
            Signature signer = Signature.getInstance("SHA256withRSA");
            signer.initSign(key);
            signer.update((header + "." + claims).getBytes(StandardCharsets.UTF_8));
            return header + "." + claims + "." + b64.encodeToString(signer.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Could not sign the FCM token request", e);
        }
    }

    private static PrivateKey privateKey(String pem) {
        String base64 = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
        try {
            return KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(base64)));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("The Firebase service account key cannot be read", e);
        }
    }
}
