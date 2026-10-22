package vn.fpt.campusstay.service.auth;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.fasterxml.jackson.annotation.JsonProperty;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.config.AuthProperties;

/**
 * Exchanges the authorization code of the web's Google Identity Services popup
 * ({@code initCodeClient}, {@code ux_mode: popup}) for Google's ID token (ADR-14).
 * The popup flow uses the special redirect URI {@code postmessage}. The ID token
 * is then checked by {@link GoogleIdTokenVerifier} exactly like Android's credential.
 * <p>Codes, tokens and the client secret are never logged.
 */
@Component
class GoogleCodeExchanger {

    private static final Logger log = LoggerFactory.getLogger(GoogleCodeExchanger.class);
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(10);
    private static final Pattern OAUTH_ERROR = Pattern.compile("\"error\"\\s*:\\s*\"([A-Za-z_]+)\"");

    record TokenResponse(@JsonProperty("id_token") String idToken) {
    }

    private final AuthProperties.Google config;
    private final RestClient http;

    @Autowired
    GoogleCodeExchanger(AuthProperties props) {
        this(props, RestClient.builder().requestFactory(requestFactory()));
    }

    /** For tests: the builder may be bound to a mock server. */
    GoogleCodeExchanger(AuthProperties props, RestClient.Builder builder) {
        this.config = props.google();
        this.http = builder.build();
    }

    /** @return Google's ID token for the code; it still has to be verified */
    String exchange(String code) {
        if (config == null || !config.codeFlowEnabled()) {
            throw ApiException.unavailable("GOOGLE_SIGN_IN_DISABLED", "Google sign-in is not available right now.");
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("code", code);
        form.add("client_id", config.clientId());
        form.add("client_secret", config.clientSecret());
        form.add("redirect_uri", "postmessage");
        TokenResponse response;
        try {
            response = http.post().uri(config.tokenUri())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(TokenResponse.class);
        } catch (RestClientResponseException e) {
            String error = oauthError(e.getResponseBodyAsString());
            if ("invalid_grant".equals(error)) {
                // The code was already used, expired or belongs to another client: the user can try again.
                log.info("Google rejected the authorization code (invalid_grant)");
                throw invalidCode();
            }
            // invalid_client, redirect_uri_mismatch, unauthorized_client or a Google outage: our side to fix.
            log.error("Google token endpoint answered HTTP {} ({}); check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
                    e.getStatusCode().value(), error);
            throw unavailable();
        } catch (ResourceAccessException e) {
            log.warn("Google token endpoint not reachable: {}", e.getMostSpecificCause().getClass().getSimpleName());
            throw unavailable();
        }
        if (response == null || response.idToken() == null || response.idToken().isBlank()) {
            log.error("Google token endpoint answered without an id_token; is the 'openid' scope requested?");
            throw invalidCode();
        }
        return response.idToken();
    }

    private static String oauthError(String body) {
        Matcher m = OAUTH_ERROR.matcher(body == null ? "" : body);
        return m.find() ? m.group(1) : "no error code";
    }

    private static ApiException invalidCode() {
        return ApiException.unauthorized("GOOGLE_TOKEN_INVALID", "Google sign-in failed. Try again.");
    }

    private static ApiException unavailable() {
        return ApiException.unavailable("GOOGLE_UNAVAILABLE",
                "Google sign-in is not working right now. Try again in a few minutes or use your email and password.");
    }

    private static JdkClientHttpRequestFactory requestFactory() {
        HttpClient client = HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(READ_TIMEOUT);
        return factory;
    }
}
