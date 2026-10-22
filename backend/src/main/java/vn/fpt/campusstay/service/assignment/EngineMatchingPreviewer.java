package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
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
 * Implements Settings's {@link MatchingPreviewer}: runs the engine over the current
 * Term's approved Applications with unsaved settings. Nothing is stored.
 */
@Component
@Transactional(readOnly = true)
class EngineMatchingPreviewer implements MatchingPreviewer {

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
    public Preview preview(Settings settings) {
        TermSummary term = terms.openForRegistration()
                .or(() -> terms.publishedTerms().stream().filter(TermSummary::current).findFirst())
                .orElse(null);
        List<Applications.Candidate> candidates = term == null ? List.of() : applications.approved(term.id());
        if (candidates.isEmpty()) {
            return new Preview(null, null, 0, "No Applications are approved yet, so the dry run had nobody to place.");
        }
        AssignmentEngine engine = engines.engine(term.id(),
                new AssignmentEngine.Settings(settings.order(), settings.weights(), settings.boost()), null, null);
        List<AssignmentEngine.Applicant> applicants = engines.applicants(candidates);
        List<AssignmentEngine.Placement> placements = engine.run(applicants);
        List<AssignmentEngine.Placement> placed = placements.stream().filter(p -> p.bedId() != null).toList();
        int toRound2 = placements.size() - placed.size();
        String source = candidates.size() + (candidates.size() == 1 ? " approved Application" : " approved Applications")
                + " of " + term.name() + "; nothing was allocated.";
        if (placed.isEmpty()) {
            return new Preview(null, null, toRound2, source);
        }
        BigDecimal average = AssignmentService.average(placed.stream().map(AssignmentEngine.Placement::fit).toList());

        Map<Long, String> majors = new HashMap<>();
        applicants.forEach(a -> majors.put(a.applicationId(), a.profile().major()));
        Map<Long, Inventory.BedSlot> beds = inventory.beds(placed.stream().map(AssignmentEngine.Placement::bedId)
                .toList());
        Map<Long, List<String>> majorsByRoom = placed.stream()
                .collect(Collectors.groupingBy(p -> beds.get(p.bedId()).roomId(),
                        Collectors.mapping(p -> majors.get(p.applicationId()), Collectors.toList())));
        List<List<String>> shared = majorsByRoom.values().stream().filter(list -> list.size() >= 2).toList();
        BigDecimal sameMajorRate = shared.isEmpty() ? null
                : BigDecimal.valueOf(shared.stream().filter(EngineMatchingPreviewer::repeatsMajor).count())
                        .divide(BigDecimal.valueOf(shared.size()), 2, RoundingMode.HALF_UP);
        return new Preview(RunStore.percent(average), sameMajorRate, toRound2, source);
    }

    private static boolean repeatsMajor(List<String> majors) {
        List<String> known = majors.stream().filter(Objects::nonNull).toList();
        return Set.copyOf(known).size() < known.size();
    }
}
