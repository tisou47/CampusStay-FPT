package vn.fpt.campusstay.service.auth;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.exception.ApiException;

/**
 * Per-client limits on the anonymous auth endpoints (review findings BE-AUTH-02, BE-AUTH-03), counted in
 * {@code auth_rate_event} (D1): a restart or a second server keeps them. An event
 * commits in its own transaction, so it stays even when the request that recorded it fails. The client is {@code RequestInfo.ip()}, the real address behind
 * the proxy (prod sets {@code server.forward-headers-strategy}). Only failed sign-ins count, so a school network
 * where many people share one address still signs in.
 */
@Component
public class AuthRateLimiter {

    /** A bucket: how many events per window before the client gets 429. */
    public enum Bucket {
        /** Per client: high enough for a school network where many people share one address. */
        SIGN_IN_FAILURES(100, Duration.ofMinutes(15)),
        PASSWORD_FORGOT(5, Duration.ofHours(1)),
        PASSWORD_RESET(10, Duration.ofHours(1)),
        /** Wrong passwords for one account from one client: the account lock only holds against that client. */
        ACCOUNT_FAILURES(5, Duration.ofMinutes(15)),
        /** Wrong passwords for one account from any client: a ceiling that rotating addresses cannot avoid. */
        ACCOUNT_ANY_CLIENT(30, Duration.ofMinutes(15));

        final int limit;
        final Duration window;

        Bucket(int limit, Duration window) {
            this.limit = limit;
            this.window = window;
        }
    }

    private final JdbcClient jdbc;
    private final Clock clock;

    public AuthRateLimiter(JdbcClient jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** Fails with 429 TOO_MANY_ATTEMPTS once the client used up the bucket. */
    public void checkAllowed(Bucket bucket, String client) {
        // shortcut: loopback is trusted only because Caddy strips client Forwarded headers (infra/prod/Caddyfile);
        // the per-account ceiling applies to every client.
        if (bucket != Bucket.ACCOUNT_ANY_CLIENT && local(client)) {
            return;
        }
        if (count(bucket, client) >= bucket.limit) {
            throw ApiException.tooManyRequests("TOO_MANY_ATTEMPTS",
                    "Too many attempts from this device. Wait a few minutes and try again.");
        }
    }

    /** Records one event (committed even when the caller rolls back) and drops the bucket's expired ones. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Bucket bucket, String client) {
        Instant now = Instant.now(clock);
        jdbc.sql("DELETE FROM auth_rate_event WHERE bucket = :b AND at <= :from")
                .param("b", bucket.name()).param("from", Timestamp.from(now.minus(bucket.window))).update();
        jdbc.sql("INSERT INTO auth_rate_event (bucket, client, at) VALUES (:b, :c, :now)")
                .param("b", bucket.name()).param("c", key(client)).param("now", Timestamp.from(now)).update();
    }

    /** Events of the bucket from the client within its window. */
    public int count(Bucket bucket, String client) {
        return jdbc.sql("SELECT count(*) FROM auth_rate_event WHERE bucket = :b AND client = :c AND at > :from")
                .param("b", bucket.name()).param("c", key(client))
                .param("from", Timestamp.from(Instant.now(clock).minus(bucket.window))).query(Integer.class).single();
    }

    public void clear(Bucket bucket, String client) {
        jdbc.sql("DELETE FROM auth_rate_event WHERE bucket = :b AND client = :c")
                .param("b", bucket.name()).param("c", key(client)).update();
    }

    /** Loopback = a developer's machine or the tests: never limited (production sees the real client). */
    private static boolean local(String client) {
        return client == null || client.equals("127.0.0.1") || client.equals("0:0:0:0:0:0:0:1") || client.equals("::1");
    }

    private static String key(String client) {
        return client == null ? "-" : client;
    }
}
