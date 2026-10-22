package vn.fpt.campusstay;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * CampusStay FPT backend — one deployable Spring MVC application in layers (ADR-17): {@code controller} (REST
 * endpoints) → {@code service} (business rules and SQL) → {@code repository} / {@code entity} (persistence), with
 * {@code dto}, {@code event}, {@code config}, {@code security}, {@code exception} and {@code common} beside them.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class CampusStayApplication {

    public static void main(String[] args) {
        SpringApplication.run(CampusStayApplication.class, args);
    }
}
