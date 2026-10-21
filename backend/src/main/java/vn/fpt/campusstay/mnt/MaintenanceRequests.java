package vn.fpt.campusstay.mnt;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

/** MNT public API for REQ: the student's requests screen, routing rules and SLA checks. */
public interface MaintenanceRequests {

    /**
     * A request as the student's list shows it; {@code id} is the code ({@code MR-000321}).
     *
     * @param assignee    the assignee's name, or null
     * @param visitWindow {@code dd/mm/yyyy hh:mm – hh:mm}, or null
     */
    record StudentItem(String id, String title, String location, String category, Instant reportedAt, String status,
            String assignee, String visitWindow) {
    }

    /** Newest first; {@code termId} null = every Term. */
    List<StudentItem> ofStudent(long studentId, Long termId);

    /**
     * An open request (Submitted, Assigned or In progress), for routing and SLA checks (REQ).
     *
     * @param category code of the {@code MAINTENANCE_CATEGORY} list; {@code urgency} {@code NORMAL} or {@code URGENT}
     */
    record OpenRequest(long id, String code, Long termId, long buildingId, String room, String title, String category,
            String urgency, String status, Long assigneeId, Instant reportedAt, int reopenCount) {
    }

    /** Open requests of the Blocks, oldest first. */
    List<OpenRequest> open(Collection<Long> buildingIds);

    /** Whether the request is still open (not Resolved or Closed); false for an unknown id. */
    boolean isOpen(long requestId);

    /** Assigns an open request (a routing rule, or the Block Manager after an escalation); {@code why} goes in its log. */
    void assign(long requestId, long assigneeId, String why);
}
