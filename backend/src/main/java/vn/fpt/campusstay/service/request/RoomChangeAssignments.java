package vn.fpt.campusstay.service.request;

import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Who is in charge of an open Room-Change Request: the escalation's reassign and Block staff's reassign share it. */
@Component
class RoomChangeAssignments {

    /** What the student asks for, by the request's kind. */
    static final Map<String, String> ASKS = Map.of("SAME", "another Room", "CLASS", "another Room Class", "TYPE",
            "another Room Type");

    private final JdbcClient jdbc;

    RoomChangeAssignments(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The title Staff screens give a request: "{student} asks for another Room". */
    static String title(String student, String kind) {
        return student + " asks for " + ASKS.get(kind);
    }

    /** Gives the request to {@code assigneeId} while it is open (Submitted or Pending); false when it is not. */
    boolean reassign(long requestId, long assigneeId) {
        return jdbc.sql("""
                UPDATE req_room_change SET assignee_id = :a, version = version + 1
                WHERE id = :id AND status IN ('SUBMITTED', 'PENDING')
                """).param("a", assigneeId).param("id", requestId).update() > 0;
    }
}
