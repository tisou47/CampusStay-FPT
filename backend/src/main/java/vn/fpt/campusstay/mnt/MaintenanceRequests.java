package vn.fpt.campusstay.mnt;

import java.time.Instant;
import java.util.List;

/** MNT public API: a student's Maintenance Requests, for the student's requests screen (REQ). */
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
}
