package vn.fpt.campusstay.asg.internal;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.asg.Residences;
import vn.fpt.campusstay.inv.Inventory;

/** Implements {@link Residences} from active Allocations. */
@Component
@Transactional(readOnly = true)
class JdbcResidences implements Residences {

    private record Row(long id, long termId, long bedId, boolean checkedIn) {
    }

    private final JdbcClient jdbc;
    private final Inventory inventory;

    JdbcResidences(JdbcClient jdbc, Inventory inventory) {
        this.jdbc = jdbc;
        this.inventory = inventory;
    }

    @Override
    public Optional<Residence> current(long studentId) {
        return jdbc.sql("""
                SELECT id, term_id, bed_id, checked_in_at IS NOT NULL AS checked_in FROM asg_allocation
                WHERE student_id = :student AND status = 'ACTIVE'
                ORDER BY checked_in_at IS NOT NULL DESC, allocated_at DESC LIMIT 1
                """).param("student", studentId)
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("bed_id"),
                        rs.getBoolean("checked_in")))
                .optional()
                .flatMap(row -> Optional.ofNullable(inventory.beds(List.of(row.bedId())).get(row.bedId()))
                        .map(bed -> new Residence(row.id(), row.termId(), studentId, bed.roomId(), bed.roomCode(),
                                bed.bedId(), bed.bedLabel(), bed.buildingId(), bed.block(), row.checkedIn())));
    }

    @Override
    public int residents(long roomId, long termId) {
        List<Long> beds = inventory.bedsOfRoom(roomId).stream().map(Inventory.BedSlot::bedId).toList();
        if (beds.isEmpty()) {
            return 0;
        }
        return jdbc.sql("""
                SELECT count(*) FROM asg_allocation
                WHERE term_id = :term AND status = 'ACTIVE' AND checked_in_at IS NOT NULL AND bed_id IN (:beds)
                """).param("term", termId).param("beds", beds).query(Integer.class).single();
    }

    @Override
    public List<TermResident> ofTerm(long termId) {
        record Row(long studentId, long bedId, boolean checkedIn) {
        }
        List<Row> rows = jdbc.sql("""
                SELECT student_id, bed_id, checked_in_at IS NOT NULL AS checked_in FROM asg_allocation
                WHERE term_id = :term AND status = 'ACTIVE'
                """).param("term", termId)
                .query((rs, i) -> new Row(rs.getLong("student_id"), rs.getLong("bed_id"), rs.getBoolean("checked_in")))
                .list();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(rows.stream().map(Row::bedId).toList());
        return rows.stream().filter(r -> beds.containsKey(r.bedId()))
                .map(r -> new TermResident(r.studentId(), beds.get(r.bedId()).buildingId(), r.checkedIn())).toList();
    }

    @Override
    public Map<Long, Long> checkedIn(Collection<Long> bedIds) {
        if (bedIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql("""
                SELECT bed_id, student_id FROM asg_allocation
                WHERE status = 'ACTIVE' AND checked_in_at IS NOT NULL AND bed_id IN (:beds)
                """).param("beds", List.copyOf(bedIds))
                .query((rs, i) -> Map.entry(rs.getLong("bed_id"), rs.getLong("student_id"))).list().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a));
    }
}
