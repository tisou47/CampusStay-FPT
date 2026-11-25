package vn.fpt.campusstay.service.inventory;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.work.WorkSource;

/** Door codes to set after a resident left a Room of the Staff member's Blocks. */
@Component
class InventoryWork implements WorkSource {

    private final JdbcClient jdbc;

    InventoryWork(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<WorkItem> work(Asker asker, Instant now) {
        List<WorkItem> out = new ArrayList<>();
        if (asker.staff() && !asker.blockIds().isEmpty()) {
            WorkSource.tally(jdbc, "door-code", "/staff/door-codes", """
                    SELECT NULL::timestamptz AS due, t.created_at AS since
                    FROM inv_door_code_task t JOIN inv_room r ON r.id = t.room_id
                    WHERE t.done_at IS NULL AND r.building_id IN (:b)""", Map.of("b", List.copyOf(asker.blockIds())),
                    now).ifPresent(out::add);
        }
        return out;
    }
}
