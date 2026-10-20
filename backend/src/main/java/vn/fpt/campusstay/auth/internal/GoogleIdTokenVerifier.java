package vn.fpt.campusstay.auth.internal;

import java.util.Locale;
import java.util.Set;

import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.shared.error.ApiException;

/**
 * Verifies a Google ID token from Google Identity Services, following Google's
 * server-side checklist: signature (Google JWKS), {@code iss}, {@code aud} =
 * our client id, {@code exp}, plus {@code hd} = the FPT Workspace domain and
 * {@code email_verified}. The email domain alone is not trusted; {@code hd} is.
 */
@Component
class GoogleIdTokenVerifier {

    record GoogleIdentity(String subject, String email, String name) {
    }

    private static final Set<String> ISSUERS = Set.of("accounts.google.com", "https://accounts.google.com");

    private final AuthProperties.Google config;
    private volatile NimbusJwtDecoder decoder;

    GoogleIdTokenVerifier(AuthProperties props) {
        this.config = props.google();
    }

    boolean enabled() {
        return config != null && config.enabled();
    }

    GoogleIdentity verify(String idToken) {
        if (!enabled()) {
            throw ApiException.unavailable("GOOGLE_SIGN_IN_DISABLED", "Google sign-in is not available right now.");
        }
        Jwt jwt;
        try {
            jwt = decoder().decode(idToken);
        } catch (JwtException e) {
            throw ApiException.unauthorized("GOOGLE_TOKEN_INVALID", "Google sign-in failed. Try again.");
        }
        Object verified = jwt.getClaim("email_verified");
        boolean emailVerified = Boolean.TRUE.equals(verified) || "true".equals(String.valueOf(verified));
        String hd = jwt.getClaimAsString("hd");
        if (!emailVerified || hd == null || !hd.equalsIgnoreCase(config.hostedDomain())) {
            throw ApiException.forbidden("GOOGLE_DOMAIN_NOT_ALLOWED",
                    "Sign in with your @" + config.hostedDomain() + " Google account.");
        }
        String email = jwt.getClaimAsString("email");
        if (email == null) {
            throw ApiException.unauthorized("GOOGLE_TOKEN_INVALID", "Google sign-in failed. Try again.");
        }
        return new GoogleIdentity(jwt.getSubject(), email.toLowerCase(Locale.ROOT), jwt.getClaimAsString("name"));
    }

    private NimbusJwtDecoder decoder() {
        NimbusJwtDecoder d = decoder;
        if (d == null) {
            synchronized (this) {
                if (decoder == null) {
                    NimbusJwtDecoder created = NimbusJwtDecoder.withJwkSetUri(config.jwkSetUri()).build();
                    OAuth2TokenValidator<Jwt> issuer = jwt -> ISSUERS.contains(jwt.getClaimAsString("iss"))
                            ? OAuth2TokenValidatorResult.success()
                            : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Bad issuer", null));
                    OAuth2TokenValidator<Jwt> audience = jwt -> jwt.getAudience() != null
                            && jwt.getAudience().contains(config.clientId())
                                    ? OAuth2TokenValidatorResult.success()
                                    : OAuth2TokenValidatorResult.failure(
                                            new OAuth2Error("invalid_token", "Bad audience", null));
                    created.setJwtValidator(new DelegatingOAuth2TokenValidator<>(new JwtTimestampValidator(), issuer,
                            audience));
                    decoder = created;
                }
                d = decoder;
            }
        }
        return d;
    }
}
