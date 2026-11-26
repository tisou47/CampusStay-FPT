package vn.fpt.campusstay.service.maintenance;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

/** Maintenance public API for Requests: the student's requests screen, routing rules and SLA checks. */
public interface MaintenanceRequests {

    /**
     * A request as the student's list shows it; {@code id} is the code ({@code MR-000321}).
     *
     * @param assignee    the assignee's name, or null
     * @param visitWindow   {@code dd/mm/yyyy hh:mm – hh:mm}, or null
     * @param reportedByYou false for a request the back office opened in the student's Room (an inspection finding):
     *                      the student follows it but does not confirm the fix
     */
    record StudentItem(String id, String title, String location, String category, Instant reportedAt, String status,
            String assignee, String visitWindow, boolean reportedByYou) {
    }

    /** Newest first; {@code termId} null = every Term. */
    List<StudentItem> ofStudent(long studentId, Long termId);

    /**
     * An open request (Submitted, Assigned or In progress), for routing and SLA checks (Requests).
     *
     * @param category code of the {@code MAINTENANCE_CATEGORY} list; {@code urgency} {@code NORMAL} or {@code URGENT}
     */
    record OpenRequest(long id, String code, Long termId, long buildingId, String room, String title, String category,
            String urgency, String status, Long assigneeId, Instant reportedAt, int reopenCount, Instant slaDueAt) {
    }

    /** Open requests of the Blocks, oldest first. */
    List<OpenRequest> open(Collection<Long> buildingIds);

    /** Whether the request is still open (not Resolved or Closed); false for an unknown id. */
    boolean isOpen(long requestId);

    /** Whether someone is already in charge of the request (an inspection's request goes to its inspector). */
    boolean isAssigned(long requestId);

    /** Assigns an open request (a routing rule, or the Block Manager after an escalation); {@code why} goes in its log. */
    default void assign(long requestId, long assigneeId, String why) {
        assign(requestId, assigneeId, why, null, null);
    }

    /**
     * Assigns an open request in the name of {@code actorId} ({@code actorRole} e.g. MANAGER), who then shows in its log
     * as for an assignment at the desk; without an actor it is the system's, with {@code why} in the text.
     */
    void assign(long requestId, long assigneeId, String why, Long actorId, String actorRole);

    /** Back to the Block queue (Submitted, nobody in charge) with a history line; nothing when it is closed. */
    void unassign(long requestId, String why);

    /** Sets the time by which the request must be finished (the Block's timer when it is routed, spec §6.18). */
    void setSlaDue(long requestId, Instant dueAt);
}
