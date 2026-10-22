package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * The rule-based assignment engine (architecture §12). Deterministic: the same
 * input gives the same proposal. No database access, so it is unit-tested alone.
 * <ol>
 * <li>Eligibility: not enrolled or an overdue Invoice → {@code NOT_ELIGIBLE}.</li>
 * <li>Order: the snapshot's criteria (priority group, then Deposit time), then id.</li>
 * <li>Invited pairs first, into an empty 2-bed Room of their Room Type and Class.</li>
 * <li>Everyone else into the free Bed with the best fit among Rooms of their Room
 * Type and Class in a Block of their gender; ties fill started Rooms first, then
 * the lowest Room code.</li>
 * <li>No Bed → {@code NO_BED}; partner not approved → {@code PARTNER_NOT_READY};
 * low fit → {@code LOW_FIT} (information only). Nothing is resolved silently.</li>
 * </ol>
 * Fit with the other occupants = weighted share of matching attributes (major,
 * cohort, region), averaged, × the boost when the student's Roommate preferences
 * match, capped at 1.
 */
final class AssignmentEngine {

    static final BigDecimal LOW_FIT = new BigDecimal("0.30");

    /** A student to place. {@code preferences}: REGION, SEMESTER, MAJOR codes keyed region, semester, major. */
    record Applicant(long applicationId, long studentId, String gender, long roomTypeId, long roomClassId,
            Long partnerApplicationId, Instant submittedAt, int priorityRank, Profile profile,
            Map<String, String> preferences, String ineligibleReason) {
    }

    /** What the fit compares. {@code semester} is {@code S<n>}. */
    record Profile(String major, String cohort, String region, String semester) {
    }

    record Bed(long bedId, String label, long roomId, String roomCode, long buildingId, String gender, int roomBeds,
            long roomTypeId, long roomClassId) {
    }

    record Settings(List<String> order, Map<String, BigDecimal> weights, BigDecimal boost) {
    }

    record Placement(long applicationId, Long bedId, Long buildingId, BigDecimal fit, String issue, String tone,
            String reason) {
    }

    private final Settings settings;
    private final Map<Long, List<Bed>> bedsByRoom = new LinkedHashMap<>();
    private final Set<Long> taken = new HashSet<>();
    /** Room → profiles of the people already there or proposed there in this run. */
    private final Map<Long, List<Profile>> occupants = new HashMap<>();

    /**
     * @param freeBeds  Beds that may be proposed (in service, not allocated in the Term)
     * @param occupied  Room → profiles of students already allocated there in the Term
     */
    AssignmentEngine(Settings settings, List<Bed> freeBeds, Map<Long, List<Profile>> occupied) {
        this.settings = settings;
        freeBeds.stream().sorted(Comparator.comparing(Bed::roomCode).thenComparing(Bed::label))
                .forEach(b -> bedsByRoom.computeIfAbsent(b.roomId(), k -> new ArrayList<>()).add(b));
        occupied.forEach((room, list) -> occupants.put(room, new ArrayList<>(list)));
    }

    List<Placement> run(List<Applicant> applicants) {
        Map<Long, Applicant> byId = new HashMap<>();
        applicants.forEach(a -> byId.put(a.applicationId(), a));
        List<Applicant> ordered = applicants.stream().sorted(order()).toList();
        Map<Long, Placement> result = new LinkedHashMap<>();

        for (Applicant a : ordered) {
            if (a.ineligibleReason() != null) {
                result.put(a.applicationId(), new Placement(a.applicationId(), null, null, null, "NOT_ELIGIBLE", "DANGER",
                        a.ineligibleReason()));
            }
        }
        // Invited pairs first: both or neither.
        for (Applicant a : ordered) {
            if (result.containsKey(a.applicationId()) || a.partnerApplicationId() == null) {
                continue;
            }
            Applicant partner = byId.get(a.partnerApplicationId());
            if (partner == null || result.containsKey(partner.applicationId())) {
                result.put(a.applicationId(), new Placement(a.applicationId(), null, null, null, "PARTNER_NOT_READY",
                        "WARNING", "The invited roommate's Application is not ready for assignment."));
                continue;
            }
            Optional<List<Bed>> room = emptyRoomFor(a, 2);
            if (room.isEmpty()) {
                String reason = "No empty 2-bed Room of the chosen Room Type and Room Class for the pair.";
                result.put(a.applicationId(), new Placement(a.applicationId(), null, null, null, "NO_BED", "WARNING", reason));
                result.put(partner.applicationId(), new Placement(partner.applicationId(), null, null, null, "NO_BED",
                        "WARNING", reason));
                continue;
            }
            List<Bed> beds = room.get();
            BigDecimal fit = pairFit(a.profile(), partner.profile());
            result.put(a.applicationId(), take(a, beds.get(0), fit));
            result.put(partner.applicationId(), take(partner, beds.get(1), fit));
        }
        for (Applicant a : ordered) {
            if (result.containsKey(a.applicationId())) {
                continue;
            }
            result.put(a.applicationId(), placeSingle(a, a.roomTypeId(), a.roomClassId())
                    .orElseGet(() -> new Placement(a.applicationId(), null, null, null, "NO_BED", "WARNING",
                            "No free Bed of the chosen Room Type and Room Class in a Block for this gender.")));
        }
        return List.copyOf(result.values());
    }

    /** Free Beds of a kind for a gender, after what this engine has placed. */
    int freeBeds(String gender, long roomTypeId, long roomClassId) {
        return (int) bedsByRoom.values().stream().flatMap(List::stream)
                .filter(b -> b.gender().equals(gender) && b.roomTypeId() == roomTypeId && b.roomClassId() == roomClassId
                        && !taken.contains(b.bedId()))
                .count();
    }

    /** The best free Bed for one student in Rooms of the given Room Type and Room Class (used to resolve conflicts too). */
    Optional<Placement> placeSingle(Applicant a, long roomTypeId, long roomClassId) {
        record Option(List<Bed> free, BigDecimal score, int people, String code, BigDecimal fit) {
        }
        List<Option> options = new ArrayList<>();
        for (List<Bed> room : bedsByRoom.values()) {
            Bed first = room.getFirst();
            if (first.roomTypeId() != roomTypeId || first.roomClassId() != roomClassId
                    || !first.gender().equals(a.gender())) {
                continue;
            }
            List<Bed> free = room.stream().filter(b -> !taken.contains(b.bedId())).toList();
            if (free.isEmpty()) {
                continue;
            }
            List<Profile> people = occupants.getOrDefault(first.roomId(), List.of());
            BigDecimal fit = people.isEmpty() ? null : fit(a, people);
            BigDecimal score = fit == null ? new BigDecimal("0.5") : fit;
            options.add(new Option(free, score, people.size(), first.roomCode(), fit));
        }
        return options.stream()
                .max(Comparator.comparing(Option::score).thenComparing(Option::people)
                        .thenComparing(Option::code, Comparator.reverseOrder()))
                .map(o -> take(a, o.free().getFirst(), o.fit()));
    }

    private Placement take(Applicant a, Bed bed, BigDecimal fit) {
        taken.add(bed.bedId());
        occupants.computeIfAbsent(bed.roomId(), k -> new ArrayList<>()).add(a.profile());
        boolean low = fit != null && fit.compareTo(LOW_FIT) < 0;
        return new Placement(a.applicationId(), bed.bedId(), bed.buildingId(), fit, low ? "LOW_FIT" : null,
                low ? "INFO" : null, low ? "Few shared attributes with the roommates." : null);
    }

    private Optional<List<Bed>> emptyRoomFor(Applicant a, int beds) {
        return bedsByRoom.values().stream()
                .filter(room -> {
                    Bed first = room.getFirst();
                    return first.roomBeds() == beds && room.size() == beds && first.roomTypeId() == a.roomTypeId()
                            && first.roomClassId() == a.roomClassId() && first.gender().equals(a.gender())
                            && room.stream().noneMatch(b -> taken.contains(b.bedId()))
                            && occupants.getOrDefault(first.roomId(), List.of()).isEmpty();
                })
                .findFirst();
    }

    /** Average weighted match with each occupant, boosted when the student's preferences match them all. */
    private BigDecimal fit(Applicant a, List<Profile> people) {
        BigDecimal total = BigDecimal.ZERO;
        for (Profile other : people) {
            total = total.add(match(a.profile(), other));
        }
        BigDecimal fit = total.divide(BigDecimal.valueOf(people.size()), 4, RoundingMode.HALF_UP);
        if (!a.preferences().isEmpty() && people.stream().allMatch(o -> prefers(a.preferences(), o))) {
            fit = fit.multiply(settings.boost()).min(BigDecimal.ONE).setScale(4, RoundingMode.HALF_UP);
        }
        return fit;
    }

    private BigDecimal pairFit(Profile a, Profile b) {
        return match(a, b).setScale(4, RoundingMode.HALF_UP);
    }

    private BigDecimal match(Profile a, Profile b) {
        BigDecimal sum = BigDecimal.ZERO;
        for (Map.Entry<String, BigDecimal> w : settings.weights().entrySet()) {
            boolean same = switch (w.getKey()) {
                case "MAJOR" -> Objects.equals(a.major(), b.major());
                case "COHORT" -> Objects.equals(a.cohort(), b.cohort());
                case "REGION" -> Objects.equals(a.region(), b.region());
                case "SEMESTER" -> Objects.equals(a.semester(), b.semester());
                default -> false;
            };
            if (same) {
                sum = sum.add(w.getValue());
            }
        }
        return sum.min(BigDecimal.ONE);
    }

    private static boolean prefers(Map<String, String> preferences, Profile other) {
        return (preferences.get("region") == null || preferences.get("region").equals(other.region()))
                && (preferences.get("semester") == null || preferences.get("semester").equals(other.semester()))
                && (preferences.get("major") == null || preferences.get("major").equals(other.major()));
    }

    private Comparator<Applicant> order() {
        Comparator<Applicant> c = (x, y) -> 0;
        for (String key : settings.order()) {
            c = switch (key) {
                case "PRIORITY_GROUP" -> c.thenComparingInt(Applicant::priorityRank);
                case "SUBMITTED_AT" -> c.thenComparing(Applicant::submittedAt,
                        Comparator.nullsLast(Comparator.naturalOrder()));
                default -> c;
            };
        }
        return c.thenComparingLong(Applicant::applicationId);
    }
}
