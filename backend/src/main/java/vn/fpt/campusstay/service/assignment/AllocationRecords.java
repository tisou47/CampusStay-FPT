package vn.fpt.campusstay.service.assignment;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.auth.StudentRecords;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.TermCatalog;

/** The student hub's Allocations, current and past (implements Auth's {@link StudentRecords}). */
@Component
@Transactional(readOnly = true)
class AllocationRecords implements StudentRecords {

    private record Row(long id, long termId, long bedId, String status, boolean checkedIn, Instant at) {
    }

    private final JdbcClient jdbc;
    private final Inventory inventory;
    private final TermCatalog terms;

    AllocationRecords(JdbcClient jdbc, Inventory inventory, TermCatalog terms) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.terms = terms;
    }

    @Override
    public String section() {
        return "allocations";
    }

    @Override
    public List<Item> of(long studentId, int limit) {
        List<Row> rows = jdbc.sql("""
                SELECT id, term_id, bed_id, status, checked_in_at IS NOT NULL AS checked_in, allocated_at
                FROM asg_allocation WHERE student_id = :student ORDER BY allocated_at DESC, id DESC LIMIT :limit
                """).param("student", studentId).param("limit", limit)
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("bed_id"),
                        rs.getString("status"), rs.getBoolean("checked_in"), rs.getTimestamp("allocated_at").toInstant()))
                .list();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(rows.stream().map(Row::bedId).toList());
        Map<Long, String> names = terms.publishedTerms().stream()
                .collect(Collectors.toMap(TermSummary::id, TermSummary::name, (a, b) -> a));
        return rows.stream().map(r -> {
            Inventory.BedSlot bed = beds.get(r.bedId());
            String status = switch (r.status()) {
                case "ACTIVE" -> r.checkedIn() ? "Checked in" : "Allocated";
                case "ENDED" -> "Ended";
                default -> "Cancelled";
            };
            return new Item("allocation", String.valueOf(r.id()),
                    bed == null ? null : "Room " + bed.roomCode() + " · Bed " + bed.bedLabel(), names.get(r.termId()),
                    status, null, r.at());
        }).toList();
    }
}
