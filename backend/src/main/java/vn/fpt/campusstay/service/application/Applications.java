package vn.fpt.campusstay.service.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** Applications public API for the assignment engine (Assignment): Approved Applications and their outcome. */
public interface Applications {

    /**
     * An Application as the engine sees it.
     *
     * @param gender               {@code M} or {@code F}
     * @param partnerApplicationId the invited roommate's Application, for an invited pair
     * @param preferences          Roommate preferences (codes of REGION, SEMESTER, MAJOR), or empty
     * @param submittedAt          when the Deposit was paid (the time of the confirmed claim)
     * @param stayTerms            Gia hạn: the Terms the student wants to stay (1–9)
     */
    record Candidate(long applicationId, String code, long termId, long studentId, String studentName,
            String studentCode, String gender, long roomTypeId, long roomClassId, long termPrice, long depositAmount,
            Long partnerApplicationId, Map<String, String> preferences, Instant submittedAt, String status,
            int stayTerms) {
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

    /** Student → status code of their live Application in the Term, Drafts left out (Notifications email groups). */
    Map<Long, String> applicants(long termId);

    /** Approved → Allocated, when the Block's proposal is committed. */
    void allocated(long applicationId, String room, String bed);

    /**
     * Allocated → Rejected: the student is not enrolled and their Bed was released before they lived in it
     * (reconciliation, spec §6.12). Runs in the caller's transaction.
     */
    void notEnrolled(long applicationId, String note);

    /** Approved → Waitlisted: no Bed of the chosen kind in this run (Round 2 may offer one). */
    void waitlisted(long applicationId, String reason);

    /** Beds of the Term held by open Round-2 options: nobody else may be placed there. */
    Set<Long> heldRound2Beds(long termId);

    /**
     * A Bed a Round-2 offer holds for a Waitlisted student.
     *
     * @param fillRate   share of the Room's Beds already taken, 0–1
     * @param difference Term price minus the Application's Term price
     */
    record Round2Option(long roomTypeId, long roomClassId, long buildingId, long bedId, String note,
            BigDecimal fillRate, long termPrice, long difference) {
    }

    /** Offers Beds to a Waitlisted Application until {@code expiresAt}; an earlier open offer is withdrawn. */
    void offerRound2(long applicationId, List<Round2Option> options, Instant expiresAt);
}
