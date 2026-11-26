package vn.fpt.campusstay.service.visitor;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.work.WorkSource;

/** Family Day guests still inside after their time slot ended, in the Staff member's Blocks or every Block. */
@Component
class VisitorWork implements WorkSource {

    private static final String OVERDUE = """
            SELECT s.ends_at AS due, s.ends_at AS since
            FROM vis_visitor v JOIN vis_registration r ON r.id = v.registration_id
            JOIN vis_time_slot s ON s.id = r.time_slot_id JOIN vis_family_day d ON d.id = r.family_day_id
            WHERE v.status = 'CHECKED_IN' AND s.ends_at < :now_""";

    private final JdbcClient jdbc;

    VisitorWork(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<WorkItem> work(Asker asker, Instant now) {
        List<WorkItem> out = new ArrayList<>();
        if (asker.staff() && !asker.blockIds().isEmpty()) {
            WorkSource.tally(jdbc, "guest-overdue", "/staff/family-days", OVERDUE + " AND d.building_id IN (:b)",
                    Map.of("b", List.copyOf(asker.blockIds())), now).ifPresent(out::add);
        } else if (asker.manager()) {
            WorkSource.tally(jdbc, "guest-overdue", "/manager/family-days", OVERDUE, Map.of(), now)
                    .ifPresent(out::add);
        }
        return out;
    }
}
