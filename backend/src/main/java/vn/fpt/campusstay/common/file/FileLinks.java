package vn.fpt.campusstay.common.file;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import vn.fpt.campusstay.security.Tokens;

/**
 * Short-lived signed links to stored files, for {@code <img>} and download
 * links that cannot send the bearer token. A service hands a link out only
 * after its own access check; the signature (HMAC-SHA256 of id and expiry)
 * proves that. A blank secret takes a random one at start-up, so links stop
 * working after a restart.
 */
@Component
public class FileLinks {

    private final byte[] secret;
    private final Duration ttl;
    private final Clock clock;

    public FileLinks(@Value("${campusstay.files.link-secret:}") String secret,
            @Value("${campusstay.files.link-ttl:30m}") Duration ttl, Clock clock) {
        this.secret = (secret == null || secret.isBlank() ? Tokens.newToken() : secret).getBytes(StandardCharsets.UTF_8);
        this.ttl = ttl;
        this.clock = clock;
    }

    /** Absolute URL of {@code GET /files/{id}} for the current request's host, valid for the configured time. */
    public String link(long fileId) {
        long expires = Instant.now(clock).plus(ttl).getEpochSecond();
        return ServletUriComponentsBuilder.fromCurrentContextPath().path("/files/{id}")
                .queryParam("exp", expires).queryParam("sig", signature(fileId, expires))
                .buildAndExpand(fileId).toUriString();
    }

    public boolean valid(long fileId, long expires, String signature) {
        return Instant.now(clock).getEpochSecond() <= expires
                && Tokens.constantTimeEquals(signature(fileId, expires), signature);
    }

    private String signature(long fileId, long expires) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            byte[] digest = mac.doFinal((fileId + ":" + expires).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 not available", e);
        }
    }
}
