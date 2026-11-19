package vn.fpt.campusstay.service.auth;

import java.util.Collection;
import java.util.Map;

/**
 * Port implemented by the modules whose work waits for a Block's staff with nobody in charge yet, for Block Manager ›
 * Staff: Auth adds up what each implementation reports and never reads their tables.
 * <p>
 * Implemented by Requests (swaps waiting for Staff, next-Term requests waiting for a decision). TODO: inspections
 * without an inspector and Family Day guests are not counted yet (designed separately).
 */
public interface BlockQueues {

    /** Kinds of waiting work, the keys of {@link #waiting}. */
    String SWAP_WAITING_STAFF = "SWAP_WAITING_STAFF";
    String NEXT_TERM_WAITING = "NEXT_TERM_WAITING";

    /** Items waiting per kind in the Blocks; kinds with nothing waiting may be left out. */
    Map<String, Long> waiting(Collection<Long> buildingIds);
}
