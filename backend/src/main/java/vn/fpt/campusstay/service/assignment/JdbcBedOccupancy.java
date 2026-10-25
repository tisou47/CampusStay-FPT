package vn.fpt.campusstay.service.assignment;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.service.inventory.BedOccupancy;

/** Implements Inventory's {@link BedOccupancy} port from active Allocations, live runs and Round-2 options. */
@Component
@Transactional(readOnly = true)
class JdbcBedOccupancy implements BedOccupancy {

    private final JdbcClient jdbc;
    private final Applications applications;

    JdbcBedOccupancy(JdbcClient jdbc, Applications applications) {
        this.jdbc = jdbc;
        this.applications = applications;
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
                WHERE status = 'ACTIVE' AND checked_in_at IS NOT NULL AND bed_id IN (:beds)
                """)
                .param("beds", List.copyOf(bedIds))
                .query((rs, i) -> Map.entry(rs.getLong("bed_id"), rs.getLong("student_id")))
                .list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    @Override
    public Optional<Stay> stayOf(long studentId, long termId) {
        return jdbc.sql("""
                SELECT id, bed_id, checked_in_at IS NOT NULL AS checked_in FROM asg_allocation
                WHERE student_id = :student AND term_id = :term AND status = 'ACTIVE'
                """)
                .param("student", studentId)
                .param("term", termId)
                .query((rs, i) -> new Stay(rs.getLong("id"), rs.getLong("bed_id"), rs.getBoolean("checked_in")))
                .optional();
    }
}
