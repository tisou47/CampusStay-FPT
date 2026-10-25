package vn.fpt.campusstay.service.setting;

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
     * Where a Term places students (ADR-20, spec §6.4 step 3).
     *
     * @param buildingIds     the Blocks it uses; empty = every active Block
     * @param excludedRoomIds Rooms it leaves out
     */
    record TermRooms(Set<Long> buildingIds, Set<Long> excludedRoomIds) {

        /** Every Room of every active Block. */
        public boolean all() {
            return buildingIds.isEmpty() && excludedRoomIds.isEmpty();
        }

        public boolean uses(long buildingId, long roomId) {
            return (buildingIds.isEmpty() || buildingIds.contains(buildingId)) && !excludedRoomIds.contains(roomId);
        }
    }

    /** The Blocks and Rooms of any Term, Drafts included. */
    TermRooms rooms(long termId);
}
