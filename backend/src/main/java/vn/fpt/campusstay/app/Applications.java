package vn.fpt.campusstay.app;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** APP public API for the assignment engine (ASG): Approved Applications and their outcome. */
public interface Applications {

    /**
     * An Application as the engine sees it.
     *
     * @param gender               {@code M} or {@code F}
     * @param partnerApplicationId the invited roommate's Application, for an invited pair
     * @param preferences          Roommate preferences (codes of REGION, SEMESTER, MAJOR), or empty
     * @param submittedAt          when the Deposit was paid
     */
    record Candidate(long applicationId, String code, long termId, long studentId, String studentName,
            String studentCode, String gender, long roomTypeId, long roomClassId, long termPrice, long depositAmount,
            Long partnerApplicationId, Map<String, String> preferences, Instant submittedAt, String status) {
    }

    /** Approved Applications of the Term, not yet Allocated. */
    List<Candidate> approved(long termId);

    Optional<Candidate> find(long applicationId);

    /** By code ({@code APP-SP27-000123}) or numeric id. */
    Optional<Candidate> find(String idOrCode);

    /** Applications by id; unknown ids are left out. */
    Map<Long, Candidate> find(Collection<Long> applicationIds);

    /** The student's live Application in the Term (not rejected, cancelled or expired). */
    Optional<Candidate> live(long studentId, long termId);

    /** Approved → Allocated, when the Block's proposal is committed. */
    void allocated(long applicationId, String room, String bed);

    /** Approved → Waitlisted: no Bed of the chosen kind in this run (Round 2 may offer one). */
    void waitlisted(long applicationId, String reason);
}
