package vn.fpt.campusstay.service.application;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.work.WorkSource;

/** Applications waiting for a Manager's review. */
@Component
class ApplicationWork implements WorkSource {

    private final JdbcClient jdbc;

    ApplicationWork(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<WorkItem> work(Asker asker, Instant now) {
        List<WorkItem> out = new ArrayList<>();
        if (asker.manager()) {
            WorkSource.tally(jdbc, "application", "/manager/applications", """
                    SELECT NULL::timestamptz AS due, submitted_at AS since FROM app_application
                    WHERE status IN ('SUBMITTED', 'UNDER_REVIEW')""", Map.of(), now).ifPresent(out::add);
        }
        return out;
    }
}
