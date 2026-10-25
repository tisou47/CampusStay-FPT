package vn.fpt.campusstay.service.assignment;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.event.ResidentLeftRoom;
import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.service.assignment.Moves;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.exception.ApiException;

/** Implements {@link Moves} on {@code asg_allocation}. */
@Component
class JdbcMoves implements Moves {

    private record Row(long id, long termId, long studentId, Long applicationId, String status, long bedId,
            Instant checkedInAt, Long checkedInBy, String[] handOverItems) {
    }

    private final JdbcClient jdbc;
    private final Inventory inventory;
    private final Applications applications;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    JdbcMoves(JdbcClient jdbc, Inventory inventory, Applications applications, ApplicationEventPublisher events,
            Clock clock) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.applications = applications;
        this.events = events;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, Placement> placements(Collection<Long> allocationIds) {
        if (allocationIds.isEmpty()) {
            return Map.of();
        }
        return placed(jdbc.sql("SELECT * FROM asg_allocation WHERE id IN (:ids)")
                .param("ids", List.copyOf(allocationIds)).query(JdbcMoves::row).list());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Placement> current(long studentId, long termId) {
        return jdbc.sql("SELECT * FROM asg_allocation WHERE student_id = :s AND term_id = :t AND status = 'ACTIVE'")
                .param("s", studentId).param("t", termId).query(JdbcMoves::row).optional()
                .flatMap(row -> Optional.ofNullable(placed(List.of(row)).get(row.id())));
    }

    @Override
    @Transactional(readOnly = true)
    public List<Long> allocationsOf(long studentId) {
        return jdbc.sql("SELECT id FROM asg_allocation WHERE student_id = :s ORDER BY id DESC").param("s", studentId)
                .query(Long.class).list();
    }

    @Override
    @Transactional(readOnly = true)
    public List<FreeBed> freeBeds(long termId, String gender, long roomTypeId, long roomClassId) {
        Map<Long, Long> occupied = new HashMap<>();
        jdbc.sql("SELECT bed_id, student_id FROM asg_allocation WHERE term_id = :t AND status = 'ACTIVE'")
                .param("t", termId).query((rs, i) -> Map.entry(rs.getLong("bed_id"), rs.getLong("student_id"))).list()
                .forEach(e -> occupied.put(e.getKey(), e.getValue()));
        Set<Long> held = applications.heldRound2Beds(termId);
        List<Inventory.BedSlot> assignable = inventory.assignableBeds(termId);
        Map<Long, Long> perRoom = assignable.stream().filter(b -> occupied.containsKey(b.bedId()))
                .collect(Collectors.groupingBy(Inventory.BedSlot::roomId, Collectors.counting()));
        return assignable.stream()
                .filter(b -> b.gender().equals(gender) && b.roomTypeId() == roomTypeId && b.roomClassId() == roomClassId
                        && !occupied.containsKey(b.bedId()) && !held.contains(b.bedId()))
                .sorted(Comparator.comparing((Inventory.BedSlot b) -> -perRoom.getOrDefault(b.roomId(), 0L))
                        .thenComparing(Inventory.BedSlot::code))
                .map(b -> new FreeBed(b.bedId(), b.code(), b.roomCode(), b.bedLabel(), b.roomId(), b.floor(), b.buildingId(),
                        b.block(), perRoom.getOrDefault(b.roomId(), 0L).intValue()))
                .toList();
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public long move(long allocationId, long bedId, String reason, long by) {
        Row old = lock(List.of(allocationId)).getFirst();
        if (applications.heldRound2Beds(old.termId()).contains(bedId)) {
            throw bedTaken();
        }
        end(old, reason);
        long moved = insert(old, bedId, reason, by);
        leaving(old, bedId);
        return moved;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public long[] swap(long aAllocationId, long bAllocationId, long by) {
        List<Row> rows = lock(List.of(aAllocationId, bAllocationId));
        Row a = rows.stream().filter(r -> r.id() == aAllocationId).findFirst().orElseThrow();
        Row b = rows.stream().filter(r -> r.id() == bAllocationId).findFirst().orElseThrow();
        if (a.termId() != b.termId()) {
            throw new IllegalArgumentException("A swap needs two Allocations of the same Term");
        }
        end(a, "SWAP");
        end(b, "SWAP");
        long[] swapped = { insert(a, b.bedId(), "SWAP", by), insert(b, a.bedId(), "SWAP", by) };
        leaving(a, b.bedId());
        leaving(b, a.bedId());
        return swapped;
    }

    /** A checked-in student moving to a Bed of another Room leaves the old Room: its door code must change. */
    private void leaving(Row from, long toBedId) {
        if (from.checkedInAt() == null) {
            return;
        }
        Map<Long, Inventory.BedSlot> beds = inventory.beds(List.of(from.bedId(), toBedId));
        Inventory.BedSlot old = beds.get(from.bedId());
        Inventory.BedSlot next = beds.get(toBedId);
        if (old != null && next != null && old.roomId() != next.roomId()) {
            events.publishEvent(new ResidentLeftRoom(old.roomId(), "MOVE_OUT"));
        }
    }

    /** Active Allocations, locked in id order (no deadlock between two swaps). */
    private List<Row> lock(List<Long> ids) {
        List<Row> rows = jdbc.sql("SELECT * FROM asg_allocation WHERE id IN (:ids) AND status = 'ACTIVE' ORDER BY id FOR UPDATE")
                .param("ids", ids).query(JdbcMoves::row).list();
        if (rows.size() != ids.size()) {
            throw ApiException.conflict("ALLOCATION_ENDED", "This student no longer holds the Bed.");
        }
        return rows;
    }

    private void end(Row row, String reason) {
        jdbc.sql("""
                UPDATE asg_allocation SET status = 'ENDED', ended_at = :now, end_reason = :reason, version = version + 1
                WHERE id = :id
                """).param("now", Timestamp.from(Instant.now(clock))).param("reason", reason).param("id", row.id())
                .update();
    }

    /** The same stay on another Bed: check-in and hand-over carry over. */
    private long insert(Row from, long bedId, String source, long by) {
        try {
            return jdbc.sql("""
                    INSERT INTO asg_allocation (term_id, application_id, student_id, bed_id, source, previous_allocation_id,
                                                allocated_at, allocated_by, checked_in_at, checked_in_by, hand_over_items)
                    VALUES (:term, :app, :student, :bed, :source, :previous, :now, :by, :checkedIn, :checkedInBy, :items)
                    RETURNING id
                    """)
                    .param("term", from.termId()).param("app", from.applicationId()).param("student", from.studentId())
                    .param("bed", bedId).param("source", source).param("previous", from.id())
                    .param("now", Timestamp.from(Instant.now(clock))).param("by", by)
                    .param("checkedIn", from.checkedInAt() == null ? null : Timestamp.from(from.checkedInAt()))
                    .param("checkedInBy", from.checkedInBy()).param("items", from.handOverItems())
                    .query(Long.class).single();
        } catch (DuplicateKeyException e) {
            throw bedTaken();
        }
    }

    /** Each Bed with its Room's class in the Allocation's own Term. */
    private Map<Long, Placement> placed(List<Row> rows) {
        Map<Long, Map<Long, Inventory.BedSlot>> bedsByTerm = new HashMap<>();
        rows.stream().collect(Collectors.groupingBy(Row::termId))
                .forEach((term, termRows) -> bedsByTerm.put(term,
                        inventory.beds(term, termRows.stream().map(Row::bedId).toList())));
        Map<Long, Placement> result = new HashMap<>();
        for (Row r : rows) {
            Inventory.BedSlot b = bedsByTerm.get(r.termId()).get(r.bedId());
            if (b != null) {
                result.put(r.id(), new Placement(r.id(), r.termId(), r.studentId(), r.applicationId(), r.status(),
                        b.bedId(), b.code(), b.roomCode(), b.bedLabel(), b.floor(), b.roomId(), b.buildingId(), b.block(),
                        b.gender(), b.roomTypeId(), b.roomClassId(), r.checkedInAt()));
            }
        }
        return result;
    }

    private static ApiException bedTaken() {
        return ApiException.conflict("BED_TAKEN", "This Bed was just taken. Choose another one.");
    }

    private static Row row(ResultSet rs, int i) throws SQLException {
        Timestamp checkedIn = rs.getTimestamp("checked_in_at");
        Array items = rs.getArray("hand_over_items");
        return new Row(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("student_id"),
                rs.getObject("application_id", Long.class), rs.getString("status"), rs.getLong("bed_id"),
                checkedIn == null ? null : checkedIn.toInstant(), rs.getObject("checked_in_by", Long.class),
                items == null ? new String[0] : (String[]) items.getArray());
    }
}
