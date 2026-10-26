package vn.fpt.campusstay.service.setting;

import java.util.Map;

/**
 * Port implemented by Applications: how many students fail each eligibility check now, for Admin › Who may apply
 * ("n students fail this now", spec §6.17). Settings must not read the student, Invoice or Application tables.
 */
public interface EligibilityCounts {

    /** The always-on check that a student's account is verified (ADR-26); it has no switch. */
    String VERIFIED = "VERIFIED";

    /** The always-on check that the student does not already hold a Bed for the Term (spec §6.6). */
    String NOT_RESIDENT = "NOT_RESIDENT";

    /**
     * @param students students of the directory with an active account
     * @param failing  criterion key (and {@link #VERIFIED}) → students who fail it now
     */
    record Counts(long students, Map<String, Long> failing) {
    }

    /** @param termId the Term open for registration (for "no other live Application"), or null */
    Counts now(Long termId);
}
