package vn.fpt.campusstay;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * CampusStay FPT backend — one deployable, modules AUTH, CFG, INV, APP, ASG,
 * BIL, REQ, MNT, NTF, RPT plus the shared kernel (ADR-01, ADR-10).
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class CampusStayApplication {

    public static void main(String[] args) {
        SpringApplication.run(CampusStayApplication.class, args);
    }
}
