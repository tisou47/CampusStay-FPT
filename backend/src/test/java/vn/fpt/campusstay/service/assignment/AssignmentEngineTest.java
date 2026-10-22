package vn.fpt.campusstay.service.assignment;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

/** The rule-based engine alone, without a database (TC-ASG-001…006). */
class AssignmentEngineTest {

    private static final long TWO_BED = 1;
    private static final long FOUR_BED = 2;
    private static final long STANDARD = 7;
    private static final Instant T0 = Instant.parse("2031-01-01T00:00:00Z");

    private static AssignmentEngine.Settings settings() {
        Map<String, BigDecimal> weights = new LinkedHashMap<>();
        weights.put("MAJOR", new BigDecimal("0.5"));
        weights.put("COHORT", new BigDecimal("0.3"));
        weights.put("REGION", new BigDecimal("0.2"));
        return new AssignmentEngine.Settings(List.of("PRIORITY_GROUP", "SUBMITTED_AT"), weights, new BigDecimal("1.2"));
    }

    private static List<AssignmentEngine.Bed> room(long roomId, String code, String gender, long type, int beds,
            long firstBedId) {
        return IntStream.range(0, beds)
                .mapToObj(i -> new AssignmentEngine.Bed(firstBedId + i, String.valueOf((char) ('A' + i)), roomId, code, 10,
                        gender, beds, type, STANDARD))
                .toList();
    }

    private static AssignmentEngine.Applicant applicant(long id, long type, Long partner, int minutes, int rank,
            String major, String ineligible) {
        return new AssignmentEngine.Applicant(id, 100 + id, "M", type, STANDARD, partner, T0.plusSeconds(60L * minutes),
                rank, new AssignmentEngine.Profile(major, "K19", "NORTH", "S3"), Map.of(), ineligible);
    }

    private static Map<Long, AssignmentEngine.Placement> byApp(List<AssignmentEngine.Placement> placements) {
        return placements.stream().collect(Collectors.toMap(AssignmentEngine.Placement::applicationId,
                Function.identity()));
    }

    /** TC-ASG-001: an invited pair shares an empty 2-bed Room; the next student gets NO_BED when none is left. */
    @Test
    void pairFirstIntoEmptyTwoBedRoom() {
        AssignmentEngine engine = new AssignmentEngine(settings(), room(1, "A-101", "M", TWO_BED, 2, 1), Map.of());
        Map<Long, AssignmentEngine.Placement> result = byApp(engine.run(List.of(
                applicant(3, TWO_BED, null, 0, Integer.MAX_VALUE, "SE", null),
                applicant(1, TWO_BED, 2L, 5, Integer.MAX_VALUE, "SE", null),
                applicant(2, TWO_BED, 1L, 6, Integer.MAX_VALUE, "AI", null))));

        assertThat(result.get(1L).bedId()).isEqualTo(1L);
        assertThat(result.get(2L).bedId()).isEqualTo(2L);
        assertThat(result.get(3L).bedId()).isNull();
        assertThat(result.get(3L).issue()).isEqualTo("NO_BED");
        assertThat(result.get(3L).tone()).isEqualTo("WARNING");
    }

    /** TC-ASG-002: a student who is no longer eligible is flagged and never placed. */
    @Test
    void ineligibleStudentIsFlagged() {
        AssignmentEngine engine = new AssignmentEngine(settings(), room(1, "A-105", "M", FOUR_BED, 4, 1), Map.of());
        AssignmentEngine.Placement p = engine.run(List.of(
                applicant(1, FOUR_BED, null, 0, 0, "SE", "Has an overdue Invoice."))).getFirst();

        assertThat(p.bedId()).isNull();
        assertThat(p.issue()).isEqualTo("NOT_ELIGIBLE");
        assertThat(p.tone()).isEqualTo("DANGER");
        assertThat(p.reason()).isEqualTo("Has an overdue Invoice.");
    }

    /** TC-ASG-003: an invited partner who is not in the run blocks the pair (PARTNER_NOT_READY). */
    @Test
    void partnerNotReady() {
        AssignmentEngine engine = new AssignmentEngine(settings(), room(1, "A-101", "M", TWO_BED, 2, 1), Map.of());
        AssignmentEngine.Placement p = engine.run(List.of(applicant(1, TWO_BED, 99L, 0, 0, "SE", null))).getFirst();

        assertThat(p.bedId()).isNull();
        assertThat(p.issue()).isEqualTo("PARTNER_NOT_READY");
    }

    /** TC-ASG-004: a single student joins the Room whose occupant shares the most attributes. */
    @Test
    void bestFitRoom() {
        List<AssignmentEngine.Bed> beds = new ArrayList<>(room(1, "A-105", "M", FOUR_BED, 4, 1));
        beds.addAll(room(2, "A-106", "M", FOUR_BED, 4, 11));
        Map<Long, List<AssignmentEngine.Profile>> occupied = Map.of(
                1L, List.of(new AssignmentEngine.Profile("BA", "K21", "MEKONG", "S5")),
                2L, List.of(new AssignmentEngine.Profile("SE", "K19", "NORTH", "S3")));
        AssignmentEngine engine = new AssignmentEngine(settings(), beds, occupied);
        AssignmentEngine.Placement p = engine.run(List.of(applicant(1, FOUR_BED, null, 0, 0, "SE", null))).getFirst();

        assertThat(p.bedId()).isEqualTo(11L);
        assertThat(p.fit()).isEqualByComparingTo("1.0000");
        assertThat(p.issue()).isNull();
    }

    /** TC-ASG-005: the priority group goes first; the same input gives the same proposal. */
    @Test
    void priorityOrderAndDeterminism() {
        List<AssignmentEngine.Applicant> applicants = List.of(
                applicant(1, TWO_BED, null, 0, Integer.MAX_VALUE, "SE", null),
                applicant(2, TWO_BED, null, 9, 0, "SE", null));
        List<AssignmentEngine.Placement> first = new AssignmentEngine(settings(),
                room(1, "A-101", "M", TWO_BED, 2, 1).subList(0, 1), Map.of()).run(applicants);
        List<AssignmentEngine.Placement> second = new AssignmentEngine(settings(),
                room(1, "A-101", "M", TWO_BED, 2, 1).subList(0, 1), Map.of()).run(applicants);

        assertThat(byApp(first).get(2L).bedId()).isEqualTo(1L);
        assertThat(byApp(first).get(1L).issue()).isEqualTo("NO_BED");
        assertThat(second).isEqualTo(first);
    }

    /** TC-ASG-006: a placement with few shared attributes is kept and marked LOW_FIT (information only). */
    @Test
    void lowFitIsInformation() {
        Map<Long, List<AssignmentEngine.Profile>> occupied = Map.of(
                1L, List.of(new AssignmentEngine.Profile("BA", "K21", "MEKONG", "S5")));
        AssignmentEngine engine = new AssignmentEngine(settings(), room(1, "A-105", "M", FOUR_BED, 4, 1).subList(1, 4),
                occupied);
        AssignmentEngine.Placement p = engine.run(List.of(applicant(1, FOUR_BED, null, 0, 0, "SE", null))).getFirst();

        assertThat(p.bedId()).isNotNull();
        assertThat(p.issue()).isEqualTo("LOW_FIT");
        assertThat(p.tone()).isEqualTo("INFO");
        assertThat(engine.freeBeds("M", FOUR_BED, STANDARD)).isEqualTo(2);
    }
}
