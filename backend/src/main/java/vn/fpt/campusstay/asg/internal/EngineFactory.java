package vn.fpt.campusstay.asg.internal;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.app.Applications;
import vn.fpt.campusstay.auth.UserDirectory;
import vn.fpt.campusstay.bil.Billing;
import vn.fpt.campusstay.cfg.Catalog;
import vn.fpt.campusstay.cfg.EligibilityRules;
import vn.fpt.campusstay.cfg.MatchingCriteria;
import vn.fpt.campusstay.inv.Inventory;

/** Gathers the engine's input from the other modules' public APIs and the Term's Allocations. */
@Component
class EngineFactory {

    private final JdbcClient jdbc;
    private final Inventory inventory;
    private final Catalog catalog;
    private final MatchingCriteria criteria;
    private final EligibilityRules rules;
    private final UserDirectory users;
    private final Billing billing;
    private final Applications applications;

    EngineFactory(JdbcClient jdbc, Inventory inventory, Catalog catalog, MatchingCriteria criteria,
            EligibilityRules rules, UserDirectory users, Billing billing, Applications applications) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.catalog = catalog;
        this.criteria = criteria;
        this.rules = rules;
        this.users = users;
        this.billing = billing;
        this.applications = applications;
    }

    static AssignmentEngine.Settings settings(MatchingCriteria.Snapshot s) {
        Map<String, BigDecimal> weights = new LinkedHashMap<>();
        s.weights().forEach(w -> weights.put(w.key(), w.value()));
        return new AssignmentEngine.Settings(s.order().stream().map(MatchingCriteria.Criterion::key).toList(), weights,
                s.boost());
    }

    /**
     * An engine over the Term's free Beds. With {@code runId}, the Beds and people of that run's proposal
     * count as taken too, except the given Application's own item (used to resolve one conflict).
     */
    AssignmentEngine engine(long termId, long snapshotId, Long runId, Long exceptApplicationId) {
        MatchingCriteria.Snapshot snapshot = criteria.byId(snapshotId).orElseGet(criteria::active);
        return engine(termId, settings(snapshot), runId, exceptApplicationId);
    }

    /** The same engine with settings that are not saved yet (Admin › Matching Criteria › dry run). */
    AssignmentEngine engine(long termId, AssignmentEngine.Settings settings, Long runId, Long exceptApplicationId) {
        Map<Long, Integer> bedsPerType = catalog.roomTypes().stream()
                .collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::beds));

        Map<Long, Long> takenBedStudent = new HashMap<>();
        jdbc.sql("SELECT bed_id, student_id FROM asg_allocation WHERE term_id = :term AND status = 'ACTIVE'")
                .param("term", termId)
                .query((rs, i) -> Map.entry(rs.getLong("bed_id"), rs.getLong("student_id"))).list()
                .forEach(e -> takenBedStudent.put(e.getKey(), e.getValue()));
        if (runId != null) {
            List<long[]> proposed = jdbc.sql("""
                    SELECT bed_id, application_id FROM asg_proposal_item
                    WHERE run_id = :run AND bed_id IS NOT NULL AND application_id <> :except
                    """).param("run", runId).param("except", exceptApplicationId == null ? -1 : exceptApplicationId)
                    .query((rs, i) -> new long[] { rs.getLong("bed_id"), rs.getLong("application_id") }).list();
            Map<Long, Applications.Candidate> apps = applications.find(proposed.stream().map(p -> p[1]).toList());
            proposed.forEach(p -> {
                Applications.Candidate c = apps.get(p[1]);
                if (c != null) {
                    takenBedStudent.put(p[0], c.studentId());
                }
            });
        }
        List<Inventory.BedSlot> assignable = inventory.assignableBeds();
        Map<Long, Inventory.BedSlot> allBeds = inventory.beds(takenBedStudent.keySet());
        Map<Long, UserDirectory.StudentProfile> profiles = users.studentProfiles(new HashSet<>(takenBedStudent.values()));
        Map<Long, List<AssignmentEngine.Profile>> occupied = new HashMap<>();
        takenBedStudent.forEach((bed, student) -> {
            Inventory.BedSlot slot = allBeds.get(bed);
            UserDirectory.StudentProfile p = profiles.get(student);
            if (slot != null && p != null) {
                occupied.computeIfAbsent(slot.roomId(), k -> new ArrayList<>()).add(profile(p));
            }
        });
        List<AssignmentEngine.Bed> free = assignable.stream()
                .filter(b -> !takenBedStudent.containsKey(b.bedId()))
                .map(b -> new AssignmentEngine.Bed(b.bedId(), b.bedLabel(), b.roomId(), b.roomCode(), b.buildingId(),
                        b.gender(), bedsPerType.getOrDefault(b.roomTypeId(), 0), b.roomTypeId(), b.roomClassId()))
                .toList();
        return new AssignmentEngine(settings, free, occupied);
    }

    /** Engine applicants for Applications, with their directory profile and the stage-1 eligibility re-check. */
    List<AssignmentEngine.Applicant> applicants(Collection<Applications.Candidate> candidates) {
        Map<Long, UserDirectory.StudentProfile> profiles = users.studentProfiles(
                candidates.stream().map(Applications.Candidate::studentId).toList());
        List<String> groups = rules.priorityGroupKeys();
        List<AssignmentEngine.Applicant> result = new ArrayList<>();
        for (Applications.Candidate c : candidates) {
            UserDirectory.StudentProfile p = profiles.get(c.studentId());
            String ineligible = null;
            if (p == null || !p.enrollmentStatus().equals("ENROLLED")) {
                ineligible = "Not enrolled any more (student records).";
            } else if (billing.hasOverdueInvoice(c.studentId())) {
                ineligible = "Has an overdue Invoice.";
            }
            int rank = Integer.MAX_VALUE;
            if (p != null) {
                for (String g : p.priorityGroups()) {
                    int index = groups.indexOf(g);
                    if (index >= 0) {
                        rank = Math.min(rank, index);
                    }
                }
            }
            result.add(new AssignmentEngine.Applicant(c.applicationId(), c.studentId(), c.gender(), c.roomTypeId(),
                    c.roomClassId(), c.partnerApplicationId(), c.submittedAt(), rank,
                    p == null ? new AssignmentEngine.Profile(null, null, null, null) : profile(p), c.preferences(),
                    ineligible));
        }
        return result;
    }

    static AssignmentEngine.Profile profile(UserDirectory.StudentProfile p) {
        return new AssignmentEngine.Profile(p.major(), p.cohort(), p.region(),
                p.semesterNo() == null ? null : "S" + p.semesterNo());
    }

    /** Lowest-code active Block of each gender: where a placement without a Bed is listed for review. */
    Map<String, Long> blockForGender() {
        Map<String, Long> result = new HashMap<>();
        inventory.assignableBeds().stream()
                .sorted((a, b) -> a.block().compareTo(b.block()))
                .forEach(b -> result.putIfAbsent(b.gender(), b.buildingId()));
        return result;
    }
}
