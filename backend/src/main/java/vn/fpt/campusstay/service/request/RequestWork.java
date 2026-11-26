package vn.fpt.campusstay.service.request;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.work.WorkSource;

/**
 * Requests: Staff get the Room-Change Requests assigned to them, agreed swaps and next-Term requests of their
 * Blocks; Managers the swaps across Blocks and the open escalations.
 */
@Component
class RequestWork implements WorkSource {

    private final JdbcClient jdbc;

    RequestWork(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<WorkItem> work(Asker asker, Instant now) {
        List<WorkItem> out = new ArrayList<>();
        if (asker.staff()) {
            WorkSource.tally(jdbc, "room-change", "/staff/room-changes", """
                    SELECT sla_due_at AS due, submitted_at AS since FROM req_room_change
                    WHERE assignee_id = :me AND status IN ('SUBMITTED', 'PENDING')""", Map.of("me", asker.userId()), now)
                    .ifPresent(out::add);
            if (!asker.blockIds().isEmpty()) {
                Map<String, Object> b = Map.of("b", List.copyOf(asker.blockIds()));
                WorkSource.tally(jdbc, "swap", "/staff/room-changes", """
                        SELECT NULL::timestamptz AS due, agreed_at AS since FROM req_swap
                        WHERE status = 'PENDING' AND (a_building_id IN (:b) OR b_building_id IN (:b))""", b, now)
                        .ifPresent(out::add);
                WorkSource.tally(jdbc, "next-term-request", "/staff/next-term", """
                        SELECT sla_due_at AS due, submitted_at AS since FROM req_stay_request
                        WHERE status = 'SUBMITTED' AND building_id IN (:b)""", b, now).ifPresent(out::add);
            }
        }
        if (asker.manager()) {
            WorkSource.tally(jdbc, "swap-manager", "/manager/room-changes", """
                    SELECT NULL::timestamptz AS due, agreed_at AS since FROM req_swap WHERE status = 'TO_MANAGER'""",
                    Map.of(), now).ifPresent(out::add);
            // An escalation is already late: it opens when the request's own timer ran out.
            WorkSource.tally(jdbc, "escalation", "/manager/escalations", """
                    SELECT opened_at AS due, opened_at AS since FROM req_escalation WHERE status = 'OPEN'""",
                    Map.of(), now).ifPresent(out::add);
        }
        return out;
    }
}
