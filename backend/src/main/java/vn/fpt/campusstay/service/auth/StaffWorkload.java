package vn.fpt.campusstay.service.auth;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;

/**
 * Port implemented by the modules that hand work to Staff (Maintenance, Requests), for Block Manager › Staff:
 * Auth adds up what each implementation reports.
 */
public interface StaffWorkload {

    /** @param resolved items the person finished (resolved, decided) since the given time */
    record Load(long open, long resolved) {
    }

    /** Per user id; people without work are left out. */
    Map<Long, Load> workload(Collection<Long> userIds, Instant resolvedSince);
}
