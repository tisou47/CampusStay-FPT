package vn.fpt.campusstay.auth.internal;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code campusstay.auth.*} — security settings owned by operations (not Admin
 * screens), set in application.yml / environment variables.
 */
@ConfigurationProperties("campusstay.auth")
public record AuthProperties(
        Duration sessionTtl,
        Duration rememberTtl,
        Duration sessionAbsoluteMax,
        Duration touchInterval,
        int maxFailedAttempts,
        Duration lockDuration,
        Duration resetTokenTtl,
        Duration inviteTokenTtl,
        int resetRequestsPerHour,
        String webBaseUrl,
        Google google) {

    /**
     * @param clientId     OAuth client id of the web/Android app (audience of the ID token);
     *                     blank disables Google sign-in
     * @param clientSecret secret of that client, needed only to exchange the web's authorization
     *                     code (ADR-14); blank disables the code flow, the Android ID token still works
     * @param hostedDomain required {@code hd} claim, e.g. fpt.edu.vn
     * @param tokenUri     Google's OAuth 2.0 token endpoint
     */
    public record Google(String clientId, String clientSecret, String hostedDomain, String jwkSetUri,
            String tokenUri) {

        public boolean enabled() {
            return clientId != null && !clientId.isBlank();
        }

        public boolean codeFlowEnabled() {
            return enabled() && clientSecret != null && !clientSecret.isBlank();
        }
    }
}
