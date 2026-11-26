package vn.fpt.campusstay.service.billing;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.work.WorkSource;

/**
 * Billing: Staff get the meter periods of their Blocks due within a day or late; Managers the payment claims to
 * confirm (due when the Invoice's time would have run out) and the refunds to decide or pay.
 */
@Component
class BillingWork implements WorkSource {

    private final JdbcClient jdbc;

    BillingWork(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<WorkItem> work(Asker asker, Instant now) {
        List<WorkItem> out = new ArrayList<>();
        if (asker.staff() && !asker.blockIds().isEmpty()) {
            WorkSource.tally(jdbc, "meter-period", "/staff/meter-readings", """
                    SELECT due_at AS due, due_at AS since FROM bil_meter_period
                    WHERE closed_at IS NULL AND due_at < :soon_ AND building_id IN (:b)""",
                    Map.of("b", List.copyOf(asker.blockIds())), now).ifPresent(out::add);
        }
        if (asker.manager()) {
            WorkSource.tally(jdbc, "payment-claim", "/manager/payment-claims", """
                    SELECT claimed_at + make_interval(secs => time_left_seconds) AS due, claimed_at AS since
                    FROM bil_payment_claim WHERE status = 'CLAIMED'""", Map.of(), now).ifPresent(out::add);
            WorkSource.tally(jdbc, "refund", "/manager/finance", """
                    SELECT NULL::timestamptz AS due, created_at AS since FROM bil_refund
                    WHERE status IN ('PENDING', 'APPROVED')""", Map.of(), now).ifPresent(out::add);
        }
        return out;
    }
}
