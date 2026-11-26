package vn.fpt.campusstay.service.auth;

import java.util.Optional;

/**
 * Why a student's personal data cannot be erased yet (Decree 13/2023, W3-D3): the data is still needed for a stay
 * or for money owed either way. Implemented by Assignment (an active Allocation) and Billing (an open Invoice or
 * refund), so AUTH reads neither table.
 */
public interface ErasureBlockers {

    /** @return the error code ({@code ERASURE_HAS_ALLOCATION} …) and its message, or empty when nothing blocks */
    Optional<Blocker> blocker(long studentId);

    record Blocker(String code, String message) {
    }
}
