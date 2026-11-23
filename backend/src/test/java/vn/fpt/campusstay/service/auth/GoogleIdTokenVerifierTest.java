package vn.fpt.campusstay.service.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.Map;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import vn.fpt.campusstay.config.AuthProperties;
import vn.fpt.campusstay.exception.ApiException;

/** Google's ID-token checklist (review finding BE-AUTH-04), on a token signed with a local key. */
class GoogleIdTokenVerifierTest {

    private static final String CLIENT = "campusstay-web.apps.googleusercontent.com";

    private final KeyPair keys = rsa();
    private final GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier(
            new AuthProperties(null, null, null, null, 0, null, null, null, 0, null,
                    new AuthProperties.Google(CLIENT, null, "fpt.edu.vn", "https://jwks.test", null)),
            NimbusJwtDecoder.withPublicKey((RSAPublicKey) keys.getPublic()).build());

    private static KeyPair rsa() {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
            g.initialize(2048);
            return g.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String token(Map<String, Object> claims) throws Exception {
        JWTClaimsSet.Builder b = new JWTClaimsSet.Builder().subject("google-sub-1").issuer("https://accounts.google.com")
                .audience(CLIENT).expirationTime(Date.from(Instant.now().plusSeconds(600)))
                .issueTime(Date.from(Instant.now())).claim("email", "an.nv@fpt.edu.vn").claim("email_verified", true)
                .claim("hd", "fpt.edu.vn");
        claims.forEach((k, v) -> {
            if (k.equals("aud")) {
                b.audience((String) v);
            } else {
                b.claim(k, v);
            }
        });
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), b.build());
        jwt.sign(new RSASSASigner((RSAPrivateKey) keys.getPrivate()));
        return jwt.serialize();
    }

    private static String code(Throwable e) {
        return ((ApiException) e).code();
    }

    /** TC-AUTH-091: a token with the FPT hd and a verified email is accepted. */
    @Test
    void acceptsAVerifiedFptAccount() throws Exception {
        assertThat(verifier.verify(token(Map.of())).email()).isEqualTo("an.nv@fpt.edu.vn");
    }

    /** TC-AUTH-092: a missing or wrong hd, or an unverified email, is 403 GOOGLE_DOMAIN_NOT_ALLOWED. */
    @Test
    void refusesOtherDomainsAndUnverifiedEmails() throws Exception {
        assertThatThrownBy(() -> verifier.verify(token(Map.of("hd", "gmail.com"))))
                .satisfies(e -> assertThat(code(e)).isEqualTo("GOOGLE_DOMAIN_NOT_ALLOWED"));
        assertThatThrownBy(() -> verifier.verify(token(Map.of("email_verified", false))))
                .satisfies(e -> assertThat(code(e)).isEqualTo("GOOGLE_DOMAIN_NOT_ALLOWED"));
        JWTClaimsSet withoutHd = new JWTClaimsSet.Builder(SignedJWT.parse(token(Map.of())).getJWTClaimsSet()).claim("hd", null)
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.RS256), withoutHd);
        jwt.sign(new RSASSASigner((RSAPrivateKey) keys.getPrivate()));
        assertThatThrownBy(() -> verifier.verify(jwt.serialize()))
                .satisfies(e -> assertThat(code(e)).isEqualTo("GOOGLE_DOMAIN_NOT_ALLOWED"));
    }

    /** TC-AUTH-093: a token for another client (aud) or from another issuer is GOOGLE_TOKEN_INVALID. */
    @Test
    void refusesAnotherAudienceOrIssuer() throws Exception {
        assertThatThrownBy(() -> verifier.verify(token(Map.of("aud", "someone-else.apps.googleusercontent.com"))))
                .satisfies(e -> assertThat(code(e)).isEqualTo("GOOGLE_TOKEN_INVALID"));
        assertThatThrownBy(() -> verifier.verify(token(Map.of("iss", "https://evil.example"))))
                .satisfies(e -> assertThat(code(e)).isEqualTo("GOOGLE_TOKEN_INVALID"));
    }
}
