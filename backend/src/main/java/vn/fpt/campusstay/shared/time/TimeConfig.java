package vn.fpt.campusstay.shared.time;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Time sources. Store and compute in UTC; business dates (stay dates, check-in
 * days, "today" on the desk screen) use the campus zone.
 */
@Configuration(proxyBeanMethods = false)
public class TimeConfig {

    /** Campus time zone (Bình Dương). */
    public static final ZoneId CAMPUS_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
