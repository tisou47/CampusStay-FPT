package vn.fpt.campusstay.service.setting;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import vn.fpt.campusstay.dto.setting.TermSummary;

/** Settings public API for Terms. */
public interface TermCatalog {

    /** Published Terms, newest stay first. */
    List<TermSummary> publishedTerms();

    Optional<TermSummary> findPublished(long termId);

    /** The published Term whose registration window is open now, if any (one at a time by design). */
    Optional<TermSummary> openForRegistration();

    /**
     * Where a Term places students (ADR-20, spec §6.4 step 3) and what it offers (review R-03).
     *
     * @param buildingIds     the Blocks it uses; empty = every active Block
     * @param excludedRoomIds Rooms it leaves out
     * @param roomTypeIds     the Room Types it offers; empty = every active one
     * @param roomClassIds    the Room Classes it offers (a Room's class in that Term); empty = every active one
     */
    record TermRooms(Set<Long> buildingIds, Set<Long> excludedRoomIds, Set<Long> roomTypeIds, Set<Long> roomClassIds) {

        /** Every Room of every active Block. */
        public boolean all() {
            return buildingIds.isEmpty() && excludedRoomIds.isEmpty() && roomTypeIds.isEmpty() && roomClassIds.isEmpty();
        }

        public boolean uses(long buildingId, long roomId) {
            return (buildingIds.isEmpty() || buildingIds.contains(buildingId)) && !excludedRoomIds.contains(roomId);
        }

        /** Whether the Term offers this Room Type × Room Class. */
        public boolean offers(long roomTypeId, long roomClassId) {
            return (roomTypeIds.isEmpty() || roomTypeIds.contains(roomTypeId))
                    && (roomClassIds.isEmpty() || roomClassIds.contains(roomClassId));
        }

        /** A Room the Term uses and whose type and class it offers. */
        public boolean uses(long buildingId, long roomId, long roomTypeId, long roomClassId) {
            return uses(buildingId, roomId) && offers(roomTypeId, roomClassId);
        }
    }

    /** The Blocks and Rooms of any Term, Drafts included. */
    TermRooms rooms(long termId);

    /**
     * The renewal milestones of a published Term N+1 (spec §5.1, M1–M7) with the published Term N just before it,
     * whose residents continue into it.
     *
     * @param previousCheckOutBy the day leavers of N must have checked out
     * @param reservedNewPercent the share of the Term's Beds kept for new students (D-29)
     */
    record Renewal(long termId, String name, String code, LocalDate stayStart, LocalDate checkInStart,
            long previousTermId, String previousName, LocalDate previousStayEnd, LocalDate previousCheckOutBy,
            Instant publishAt, Instant requestsOpenAt, Instant requestsCloseAt, Instant decisionsDueAt,
            Instant reconciliationDueAt, Instant feesIssueAt, Instant feesDueAt, BigDecimal reservedNewPercent) {
    }

    /** The renewal milestones of a published Term; empty when it has none (the first Term) or none runs before it. */
    Optional<Renewal> renewal(long termId);

    /** Every published Term with renewal milestones, the latest stay first. */
    List<Renewal> renewals();
}
