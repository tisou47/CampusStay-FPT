package vn.fpt.campusstay.service.auth;

/**
 * Whether a student's gender may not change now (BE-3RD-09): Blocks, Beds and roommate pairs were chosen by it.
 * Implemented by Assignment (a Bed held) and Applications (a live Application), so AUTH reads neither table.
 */
public interface GenderLocks {

    /** @return true when the student holds something chosen by their gender */
    boolean locked(long studentId);
}
