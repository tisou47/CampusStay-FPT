package vn.fpt.campusstay.service.assignment;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.service.inventory.BedOccupancy;

/** Implements Inventory's {@link BedOccupancy} port from active Allocations, live runs and Round-2 options. */
@Component
@Transactional(readOnly = true)
class JdbcBedOccupancy implements BedOccupancy {

    private final JdbcClient jdbc;
    private final Applications applications;
    private final Billing billing;
    private final TermCatalog terms;
    private final Clock clock;

    JdbcBedOccupancy(JdbcClient jdbc, Applications applications, Billing billing, TermCatalog terms, Clock clock) {
        this.jdbc = jdbc;
        this.applications = applications;
        this.billing = billing;
        this.terms = terms;
        this.clock = clock;
    }

    @Override
    public Map<Long, Long> occupants(long termId, Collection<Long> bedIds) {
        Map<Long, Long> result = new HashMap<>();
        if (bedIds.isEmpty()) {
            return result;
        }
        jdbc.sql("""
                SELECT bed_id, student_id FROM asg_allocation
                WHERE status = 'ACTIVE' AND term_id = :term AND bed_id IN (:beds)
                """)
                .param("term", termId)
                .param("beds", List.copyOf(bedIds))
                .query((rs, i) -> Map.entry(rs.getLong("bed_id"), rs.getLong("student_id")))
                .list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    @Override
    public Set<Long> bedsInUse(Collection<Long> bedIds) {
        if (bedIds.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jdbc.sql("SELECT DISTINCT bed_id FROM asg_allocation WHERE status = 'ACTIVE' AND bed_id IN (:beds)")
                .param("beds", List.copyOf(bedIds))
                .query(Long.class).list());
    }

    @Override
    public Set<Long> bedsInUse() {
        return new HashSet<>(jdbc.sql("SELECT DISTINCT bed_id FROM asg_allocation WHERE status = 'ACTIVE'")
                .query(Long.class).list());
    }

    @Override
    public Set<Long> bedsPromised(Collection<Long> termIds, Collection<Long> bedIds) {
        if (termIds.isEmpty() || bedIds.isEmpty()) {
            return Set.of();
        }
        Set<Long> result = new HashSet<>(jdbc.sql("""
                SELECT bed_id FROM asg_allocation WHERE status = 'ACTIVE' AND term_id IN (:terms) AND bed_id IN (:beds)
                UNION
                SELECT i.bed_id FROM asg_proposal_item i JOIN asg_run r ON r.id = i.run_id
                WHERE r.kind <> 'DRY_RUN' AND r.status IN ('RUNNING', 'PROPOSED', 'IN_REVIEW') AND r.term_id IN (:terms)
                      AND i.bed_id IN (:beds)
                """)
                .param("terms", List.copyOf(termIds))
                .param("beds", List.copyOf(bedIds))
                .query(Long.class).list());
        Set<Long> asked = new HashSet<>(bedIds);
        for (long term : termIds) {
            applications.heldRound2Beds(term).stream().filter(asked::contains).forEach(result::add);
        }
        return result;
    }

    @Override
    public Map<Long, Long> residents(Collection<Long> bedIds) {
        Map<Long, Long> result = new HashMap<>();
        if (bedIds.isEmpty()) {
            return result;
        }
        jdbc.sql("""
                SELECT bed_id, student_id FROM asg_allocation
                WHERE status = 'ACTIVE' AND resident_at IS NOT NULL AND bed_id IN (:beds)
                """)
                .param("beds", List.copyOf(bedIds))
                .query((rs, i) -> Map.entry(rs.getLong("bed_id"), rs.getLong("student_id")))
                .list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    @Override
    public Set<Long> codeHolders(Collection<Long> bedIds) {
        if (bedIds.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jdbc.sql("""
                SELECT a.student_id FROM asg_allocation a
                WHERE a.status = 'ACTIVE' AND a.code_released_at IS NOT NULL AND a.bed_id IN (:beds)
                  AND NOT EXISTS (SELECT 1 FROM asg_termination t WHERE t.allocation_id = a.id AND t.status = 'OVERDUE')
                """).param("beds", List.copyOf(bedIds)).query(Long.class).list());
    }

    @Override
    public Map<Long, String> bedStates(long termId, Collection<Long> bedIds) {
        Map<Long, String> result = new HashMap<>();
        if (bedIds.isEmpty()) {
            return result;
        }
        record Held(long id, long bedId, boolean resident) {
        }
        List<Held> held = jdbc.sql("""
                SELECT id, bed_id, resident_at IS NOT NULL AS resident FROM asg_allocation
                WHERE status = 'ACTIVE' AND term_id = :term AND bed_id IN (:beds)
                """).param("term", termId).param("beds", List.copyOf(bedIds))
                .query((rs, i) -> new Held(rs.getLong("id"), rs.getLong("bed_id"), rs.getBoolean("resident"))).list();
        Map<Long, Billing.CheckInDue> unpaid = billing.checkInDues(held.stream().filter(h -> !h.resident())
                .map(Held::id).toList());
        held.forEach(h -> result.put(h.bedId(), h.resident() ? "RESIDENT" : unpaid.containsKey(h.id()) ? "UNPAID" : "PAID"));
        return result;
    }

    @Override
    public Optional<Stay> currentStay(long studentId) {
        record Row(long id, long termId, long bedId, boolean released, boolean overdue) {
        }
        Map<Long, LocalDate> starts = new HashMap<>();
        terms.publishedTerms().forEach(t -> starts.put(t.id(), t.stayStart()));
        Optional<Row> found = jdbc.sql("""
                SELECT a.id, a.term_id, a.bed_id, a.code_released_at IS NOT NULL AS released,
                       EXISTS (SELECT 1 FROM asg_termination t WHERE t.allocation_id = a.id AND t.status = 'OVERDUE')
                           AS overdue
                FROM asg_allocation a WHERE a.student_id = :student AND a.status = 'ACTIVE'
                """).param("student", studentId)
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("bed_id"),
                        rs.getBoolean("released"), rs.getBoolean("overdue")))
                .list().stream()
                .min(Comparator.comparing((Row r) -> !r.released())
                        .thenComparing(r -> starts.getOrDefault(r.termId(), LocalDate.MAX)).thenComparing(Row::id));
        return found.map(r -> {
            LocalDate start = terms.findPublished(r.termId()).map(TermSummary::checkInStart).orElse(null);
            if (r.overdue()) {
                return new Stay(r.id(), r.bedId(), false, "TERMINATED", start);
            }
            if (r.released()) {
                return new Stay(r.id(), r.bedId(), true, null, start);
            }
            String waiting = !billing.checkInDues(List.of(r.id())).isEmpty() ? "PAYMENT"
                    : start != null && LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE)).isBefore(start)
                            ? "CHECK_IN_START" : "CODE";
            return new Stay(r.id(), r.bedId(), false, waiting, start);
        });
    }
}
