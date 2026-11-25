package vn.fpt.campusstay.service.auth;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.work.WorkSource;

/** Accounts: erasure requests and open reconciliation items wait for a Manager. */
@Component
class AccountWork implements WorkSource {

    private final JdbcClient jdbc;

    AccountWork(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<WorkItem> work(Asker asker, Instant now) {
        List<WorkItem> out = new ArrayList<>();
        if (asker.manager()) {
            WorkSource.tally(jdbc, "erasure", "/manager/erasure-requests", """
                    SELECT NULL::timestamptz AS due, requested_at AS since FROM auth_erasure_request
                    WHERE status = 'PENDING'""", Map.of(), now).ifPresent(out::add);
            WorkSource.tally(jdbc, "reconciliation", "/manager/reconciliation", """
                    SELECT NULL::timestamptz AS due, r.created_at AS since
                    FROM auth_reconciliation_item i JOIN auth_reconciliation r ON r.id = i.reconciliation_id
                    WHERE i.status = 'OPEN'""", Map.of(), now).ifPresent(out::add);
        }
        return out;
    }
}
