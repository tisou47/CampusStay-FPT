package vn.fpt.campusstay.service.assignment;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.inventory.BedOccupancy;

/** Implements Inventory's {@link BedOccupancy} port from active Allocations. */
@Component
@Transactional(readOnly = true)
class JdbcBedOccupancy implements BedOccupancy {

    private final JdbcClient jdbc;

    JdbcBedOccupancy(JdbcClient jdbc) {
        this.jdbc = jdbc;
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
}
