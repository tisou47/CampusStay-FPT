package vn.fpt.campusstay.app;

import java.util.Optional;

/**
 * Port implemented by ASG, which owns Allocations: a Waitlisted student
 * accepted a Round-2 option, so the Bed is allocated at the option's Term
 * price. APP must not write ASG tables and ASG already depends on APP.
 */
public interface Round2Placements {

    /** @return the code of the Balance Invoice, when one is due */
    Optional<String> place(long applicationId, long bedId, long termPrice);
}
