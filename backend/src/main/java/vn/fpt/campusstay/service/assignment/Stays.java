package vn.fpt.campusstay.service.assignment;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Assignment public API for the Term transition (spec §4, §5.1, §6.10): Stays (stay length and Terms used), the requests
 * window of a Term and the next-Term Allocations of its continuing residents. Requests decides next-Term changes on
 * these Allocations (moves and swaps go through {@link Moves}); Accounts reconciles them with the enrolled list.
 */
public interface Stays {

    /**
     * The requests window of a Term N+1 (spec §5.1).
     *
     * @param openedAt     when its next-Term Allocations were created (M2 ran), else null
     * @param closedAt     when filing closed (M3 ran: Allocations still awaiting extension were cancelled)
     * @param feesIssuedAt when a Manager issued the next-Term fees (M6); next-Term Beds are frozen from then on
     */
    record Window(long termId, String termName, String termCode, LocalDate stayStart, LocalDate checkInStart,
            long previousTermId,
            String previousTermName, LocalDate previousCheckOutBy, Instant opensAt, Instant closesAt,
            Instant decisionsDueAt, Instant reconciliationDueAt, Instant feesIssueAt, Instant feesDueAt,
            Instant openedAt, Instant closedAt, Instant feesIssuedAt) {

        /** Students can file next-Term requests now (M2 ≤ now < M3). */
        public boolean filing(Instant now) {
            return openedAt != null && closedAt == null && now.isBefore(closesAt);
        }

        /** Staff and Managers can still decide next-Term requests (before the fees are issued). */
        public boolean deciding() {
            return openedAt != null && feesIssuedAt == null;
        }
    }

    /** The requests window of a published Term with renewal milestones, empty otherwise. */
    Optional<Window> window(long termId);

    /** Windows whose next-Term Allocations exist and whose Term has not started yet, the latest Term first. */
    List<Window> openWindows();

    /**
     * A next-Term Allocation (spec §4).
     *
     * @param state          {@code AWAITING_EXTENSION} (the current Term is the Stay's last) or {@code CONTINUING}
     * @param feePaid        its next-Term room fee is paid
     * @param committedTerms stay length of the Stay; {@code termsUsed} the Terms counted so far
     */
    record NextTerm(long allocationId, long termId, long studentId, long stayId, String state, boolean feePaid,
            int committedTerms, int termsUsed) {

        public boolean continuing() {
            return state.equals("CONTINUING");
        }

        /** Terms left on the Stay after the current one. */
        public int termsLeft() {
            return Math.max(0, committedTerms - termsUsed);
        }
    }

    /** The student's next-Term Allocation in the Term, empty without one. */
    Optional<NextTerm> nextTerm(long studentId, long termId);

    /** Next-Term Allocations by id; ids of other Allocations are left out. */
    Map<Long, NextTerm> nextTerms(Collection<Long> allocationIds);

    /** The next-Term Allocations held in a Room for the Term: its continuing residents (D-04 consents). */
    List<NextTerm> ofRoom(long roomId, long termId);

    /** Students with a next-Term Allocation in the Term. */
    Set<Long> continuingStudents(long termId);

    /** Active Allocations of the Term on these Beds (next-Term ones included), by id. */
    List<Long> allocationsOnBeds(long termId, Collection<Long> bedIds);

    /**
     * A student's Stay for My Room and the student hub.
     *
     * @param status {@code ACTIVE} or {@code ENDED}
     */
    record StayView(long id, long firstTermId, int committedTerms, int termsUsed, String status, Instant startedAt) {
    }

    /** The student's active Stay, else the latest one. */
    Optional<StayView> stayOf(long studentId);

    /** The most Terms a Stay may commit to (Admin › Stay and renewal). */
    int maxStayTerms();

    /**
     * Adds Terms to the Stay of a next-Term Allocation; one awaiting extension becomes continuing (spec §6.10).
     * Runs in the caller's transaction.
     */
    void extend(long allocationId, int extraTerms);

    /**
     * Ends the stay after the current Term: the next-Term Allocation is cancelled and its Bed is free for the next
     * Term (spec §6.10). Runs in the caller's transaction. @return whether an Allocation was cancelled
     */
    boolean endAfterThisTerm(long allocationId);
}
