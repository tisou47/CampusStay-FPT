package vn.fpt.campusstay;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * CampusStay FPT backend — one deployable Spring MVC application in layers (ADR-17): {@code controller} (REST
 * endpoints) → {@code service} (business rules and SQL) → {@code repository} / {@code entity} (persistence), with
 * {@code dto}, {@code event}, {@code config}, {@code security}, {@code exception} and {@code common} beside them.
 */
// Sign-in uses CampusStay's own sessions (security.BearerTokenFilter), so Spring's default in-memory user, whose
// generated password Boot writes to the log at startup, is never created.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
@EnableScheduling
public class CampusStayApplication {

    public static void main(String[] args) {
        SpringApplication.run(CampusStayApplication.class, args);
    }
}
