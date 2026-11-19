package vn.fpt.campusstay.service.auth;

import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

/**
 * Port implemented by the modules that hand work to Staff (Maintenance, Requests), for Block Manager › Staff:
 * Auth adds up what each implementation reports.
 */
public interface StaffWorkload {

    /** Kinds of work a person holds: the keys of {@link Load#openByType()} and of {@link StaffWork.Item#type()}. */
    String MAINTENANCE = "MAINTENANCE";
    String ROOM_CHANGE = "ROOM_CHANGE";
    String INSPECTION = "INSPECTION";

    /**
     * @param openByType   open items assigned to the person, per kind ({@link #MAINTENANCE}, …)
     * @param overdue      open items past their due time (a Maintenance Request's SLA, an inspection's due time)
     * @param oldestOpenAt when the oldest open item was opened, or null
     * @param resolved     items the person finished (resolved, decided) since the given time
     */
    record Load(Map<String, Long> openByType, long overdue, Instant oldestOpenAt, long resolved) {

        public Load {
            openByType = Map.copyOf(openByType);
        }

        public static final Load NONE = new Load(Map.of(), 0, null, 0);

        public long open() {
            return openByType.values().stream().mapToLong(Long::longValue).sum();
        }

        /** Both loads together (one person's work reported by several modules). */
        public Load plus(Load other) {
            Map<String, Long> byType = new HashMap<>(openByType);
            other.openByType.forEach((k, v) -> byType.merge(k, v, Long::sum));
            Instant oldest = oldestOpenAt == null ? other.oldestOpenAt
                    : other.oldestOpenAt == null || oldestOpenAt.isBefore(other.oldestOpenAt) ? oldestOpenAt
                    : other.oldestOpenAt;
            return new Load(byType, overdue + other.overdue, oldest, resolved + other.resolved);
        }
    }

    /** Per user id; people without work are left out. */
    Map<Long, Load> workload(Collection<Long> userIds, Instant resolvedSince);
}
