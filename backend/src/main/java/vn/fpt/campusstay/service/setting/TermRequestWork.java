package vn.fpt.campusstay.service.setting;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.work.WorkSource;

/** Registration-period requests from Managers waiting for the Admin. */
@Component
class TermRequestWork implements WorkSource {

    private final JdbcClient jdbc;

    TermRequestWork(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<WorkItem> work(Asker asker, Instant now) {
        List<WorkItem> out = new ArrayList<>();
        if (asker.admin()) {
            WorkSource.tally(jdbc, "term-request", "/admin/term-requests", """
                    SELECT NULL::timestamptz AS due, created_at AS since FROM cfg_term_request
                    WHERE status IN ('SUBMITTED', 'IN_PROGRESS')""", Map.of(), now).ifPresent(out::add);
        }
        return out;
    }
}
