package vn.fpt.campusstay.service.application;

import java.util.Optional;

/**
 * Port implemented by Assignment, which owns Allocations: a Waitlisted student
 * accepted a Round-2 option, so the Bed is allocated at the option's Term
 * price. Applications must not write Assignment tables and Assignment already depends on Applications.
 */
public interface Round2Placements {

    /** @return the code of the Balance Invoice, when one is due */
    Optional<String> place(long applicationId, long bedId, long termPrice);
}
