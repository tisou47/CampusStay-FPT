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
     * @param hostedDomain required {@code hd} claim, e.g. fpt.edu.vn
     */
    public record Google(String clientId, String hostedDomain, String jwkSetUri) {

        public boolean enabled() {
            return clientId != null && !clientId.isBlank();
        }
    }
}
