package vn.fpt.campusstay.service.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import vn.fpt.campusstay.exception.ApiException;

/**
 * Per-client limits on the anonymous auth endpoints (review findings BE-AUTH-02, BE-AUTH-03), in memory like the
 * assistant's hourly limit: a restart forgets them. The client is {@code RequestInfo.ip()}, the real address behind
 * the proxy (prod sets {@code server.forward-headers-strategy}). Only failed sign-ins count, so a school network
 * where many people share one address still signs in.
 */
@Component
public class AuthRateLimiter {

    /** A bucket: how many events per window before the client gets 429. */
    public enum Bucket {
        SIGN_IN_FAILURES(20, Duration.ofMinutes(15)),
        PASSWORD_FORGOT(5, Duration.ofHours(1)),
        PASSWORD_RESET(10, Duration.ofHours(1)),
        /** Wrong passwords for one account from one client: the account lock only holds against that client. */
        ACCOUNT_FAILURES(5, Duration.ofMinutes(15));

        final int limit;
        final Duration window;

        Bucket(int limit, Duration window) {
            this.limit = limit;
            this.window = window;
        }
    }

    private final Map<String, Deque<Instant>> events = new ConcurrentHashMap<>();
    private final Clock clock;

    public AuthRateLimiter(Clock clock) {
        this.clock = clock;
    }

    /** Fails with 429 TOO_MANY_ATTEMPTS once the client used up the bucket. */
    public void checkAllowed(Bucket bucket, String client) {
        if (local(client)) {
            return;
        }
        if (count(bucket, client) >= bucket.limit) {
            throw ApiException.tooManyRequests("TOO_MANY_ATTEMPTS",
                    "Too many attempts from this device. Wait a few minutes and try again.");
        }
    }

    public void record(Bucket bucket, String client) {
        Deque<Instant> times = events.computeIfAbsent(key(bucket, client), k -> new ArrayDeque<>());
        synchronized (times) {
            prune(times, bucket);
            times.addLast(Instant.now(clock));
        }
    }

    /** Events of the bucket from the client within its window. */
    public int count(Bucket bucket, String client) {
        Deque<Instant> times = events.get(key(bucket, client));
        if (times == null) {
            return 0;
        }
        synchronized (times) {
            prune(times, bucket);
            if (times.isEmpty()) {
                events.remove(key(bucket, client), times);
            }
            return times.size();
        }
    }

    public void clear(Bucket bucket, String client) {
        events.remove(key(bucket, client));
    }

    private void prune(Deque<Instant> times, Bucket bucket) {
        Instant from = Instant.now(clock).minus(bucket.window);
        while (!times.isEmpty() && !times.peekFirst().isAfter(from)) {
            times.pollFirst();
        }
    }

    /** Loopback = a developer's machine or the tests: never limited (production sees the real client). */
    private static boolean local(String client) {
        return client == null || client.equals("127.0.0.1") || client.equals("0:0:0:0:0:0:0:1") || client.equals("::1");
    }

    private static String key(Bucket bucket, String client) {
        return bucket.name() + "|" + (client == null ? "-" : client);
    }
}
