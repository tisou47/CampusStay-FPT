package vn.fpt.campusstay.service.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

/** TC-AUTH-100 (M4): keys of clients seen long ago are swept, so the map does not grow without bound. */
class AuthRateLimiterTest {

    /** A clock the test moves. */
    private static final class MovingClock extends Clock {
        Instant now = Instant.parse("2031-01-01T00:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    @Test
    void sweepsExpiredClientsEveryThousandRecords() {
        MovingClock clock = new MovingClock();
        AuthRateLimiter limiter = new AuthRateLimiter(clock);
        for (int i = 0; i < 999; i++) {
            limiter.record(AuthRateLimiter.Bucket.PASSWORD_FORGOT, "10.0.0." + i);
        }
        assertThat(limiter.keys()).isEqualTo(999);
        clock.now = clock.now.plus(Duration.ofHours(2));
        limiter.record(AuthRateLimiter.Bucket.PASSWORD_FORGOT, "10.0.9.9");
        assertThat(limiter.keys()).isEqualTo(1);
        assertThat(limiter.count(AuthRateLimiter.Bucket.PASSWORD_FORGOT, "10.0.9.9")).isEqualTo(1);
    }
}
