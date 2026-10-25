package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.service.setting.MatchingPreviewer;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.repository.assignment.RunStore;

/**
 * Implements Settings's {@link MatchingPreviewer}: runs the engine over the approved Applications of the Term open
 * for registration (else the current Term) with the draft settings and with the rules in use, and compares them
 * (spec §6.17). Nothing is stored.
 */
@Component
@Transactional(readOnly = true)
class EngineMatchingPreviewer implements MatchingPreviewer {

    private static final Map<String, String> ATTRIBUTES = new LinkedHashMap<>();

    static {
        ATTRIBUTES.put("MAJOR", "Major");
        ATTRIBUTES.put("COHORT", "Cohort");
        ATTRIBUTES.put("REGION", "Region");
        ATTRIBUTES.put("SEMESTER", "Semester");
    }

    private final EngineFactory engines;
    private final Applications applications;
    private final TermCatalog terms;
    private final Inventory inventory;

    EngineMatchingPreviewer(EngineFactory engines, Applications applications, TermCatalog terms, Inventory inventory) {
        this.engines = engines;
        this.applications = applications;
        this.terms = terms;
        this.inventory = inventory;
    }

    @Override
    public Preview preview(Settings draft, Settings inUse) {
        TermSummary term = terms.openForRegistration()
                .or(() -> terms.publishedTerms().stream().filter(TermSummary::current).findFirst())
                .orElse(null);
        List<Applications.Candidate> candidates = term == null ? List.of() : applications.approved(term.id());
        if (candidates.isEmpty()) {
            return new Preview(null, null, 0, "No Applications are approved yet, so the dry run had nobody to place.",
                    null, null, null, null, null);
        }
        List<AssignmentEngine.Applicant> applicants = engines.applicants(candidates);
        List<AssignmentEngine.Placement> drafted = run(term, draft, applicants);
        List<AssignmentEngine.Placement> current = run(term, inUse, applicants);
        List<AssignmentEngine.Placement> placed = drafted.stream().filter(p -> p.bedId() != null).toList();
        int toRound2 = drafted.size() - placed.size();
        String source = candidates.size() + (candidates.size() == 1 ? " approved Application" : " approved Applications")
                + " of " + term.name() + "; nothing was allocated.";

        Map<Long, AssignmentEngine.Applicant> byApplication = applicants.stream()
                .collect(Collectors.toMap(AssignmentEngine.Applicant::applicationId, Function.identity()));
        Map<Long, Long> beforeBeds = new HashMap<>();
        current.forEach(p -> beforeBeds.put(p.applicationId(), p.bedId()));
        int moved = (int) drafted.stream()
                .filter(p -> !Objects.equals(p.bedId(), beforeBeds.get(p.applicationId())))
                .count();
        Result draftResult = result(drafted, byApplication);
        Result inUseResult = result(current, byApplication);
        if (placed.isEmpty()) {
            return new Preview(null, null, toRound2, source, inUseResult, draftResult, moved, applicants.size(), null);
        }

        Map<Long, Inventory.BedSlot> beds = inventory.beds(term.id(),
                placed.stream().map(AssignmentEngine.Placement::bedId).toList());
        Map<Long, List<AssignmentEngine.Placement>> byRoom = placed.stream()
                .collect(Collectors.groupingBy(p -> beds.get(p.bedId()).roomId(), LinkedHashMap::new,
                        Collectors.toList()));
        List<List<String>> shared = byRoom.values().stream().filter(list -> list.size() >= 2)
                .map(list -> list.stream().map(p -> byApplication.get(p.applicationId()).profile().major()).toList())
                .toList();
        BigDecimal sameMajorRate = shared.isEmpty() ? null
                : BigDecimal.valueOf(shared.stream().filter(EngineMatchingPreviewer::repeats).count())
                        .divide(BigDecimal.valueOf(shared.size()), 2, RoundingMode.HALF_UP);
        ExampleRoom example = byRoom.entrySet().stream()
                .filter(e -> e.getValue().size() >= 2)
                .max(Comparator.comparing((Map.Entry<Long, List<AssignmentEngine.Placement>> e) -> e.getValue().size())
                        .thenComparing(e -> average(e.getValue())))
                .map(e -> example(beds.get(e.getValue().getFirst().bedId()).roomCode(), e.getValue(), byApplication,
                        draft.weights().keySet()))
                .orElse(null);
        return new Preview(draftResult.averageFit(), sameMajorRate, toRound2, source, inUseResult, draftResult, moved,
                applicants.size(), example);
    }

    private List<AssignmentEngine.Placement> run(TermSummary term, Settings settings,
            List<AssignmentEngine.Applicant> applicants) {
        return engines.engine(term.id(), new AssignmentEngine.Settings(settings.order(), settings.weights(),
                settings.boost()), null, null).run(applicants);
    }

    private static Result result(List<AssignmentEngine.Placement> placements,
            Map<Long, AssignmentEngine.Applicant> applicants) {
        List<AssignmentEngine.Placement> placed = placements.stream().filter(p -> p.bedId() != null).toList();
        int priority = (int) applicants.values().stream().filter(a -> a.priorityRank() != Integer.MAX_VALUE).count();
        int priorityPlaced = (int) placed.stream()
                .filter(p -> applicants.get(p.applicationId()).priorityRank() != Integer.MAX_VALUE).count();
        Integer fit = placed.isEmpty() ? null
                : RunStore.percent(AssignmentService.average(placed.stream().map(AssignmentEngine.Placement::fit)
                        .toList()));
        return new Result(placed.size(), fit, priorityPlaced, priority);
    }

    /** What the occupants share, for the criteria the draft uses. */
    private static ExampleRoom example(String room, List<AssignmentEngine.Placement> placements,
            Map<Long, AssignmentEngine.Applicant> applicants, Set<String> used) {
        List<AssignmentEngine.Profile> people = placements.stream()
                .map(p -> applicants.get(p.applicationId()).profile()).toList();
        List<Attribute> attributes = new ArrayList<>();
        ATTRIBUTES.forEach((key, label) -> {
            if (!used.contains(key)) {
                return;
            }
            Map<String, Long> counts = people.stream()
                    .map(p -> switch (key) {
                        case "MAJOR" -> p.major();
                        case "COHORT" -> p.cohort();
                        case "REGION" -> p.region();
                        default -> p.semester();
                    })
                    .filter(Objects::nonNull)
                    .collect(Collectors.groupingBy(Function.identity(), LinkedHashMap::new, Collectors.counting()));
            counts.entrySet().stream().max(Map.Entry.comparingByValue())
                    .ifPresent(top -> attributes.add(new Attribute(key, label, top.getKey(), top.getValue().intValue())));
        });
        return new ExampleRoom(room, people.size(), RunStore.percent(average(placements)), attributes);
    }

    private static BigDecimal average(List<AssignmentEngine.Placement> placements) {
        return AssignmentService.average(placements.stream().map(AssignmentEngine.Placement::fit).toList());
    }

    private static boolean repeats(List<String> majors) {
        List<String> known = majors.stream().filter(Objects::nonNull).toList();
        return Set.copyOf(known).size() < known.size();
    }
}
