package vn.fpt.campusstay.service.assignment;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.inventory.RoomRecords;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;

/**
 * The Room hub's residents: who holds its Beds in the Terms not over yet (the current Term and the next one),
 * by Term then Bed (implements Inventory's {@link RoomRecords}).
 */
@Component
@Transactional(readOnly = true)
class RoomResidentRecords implements RoomRecords {

    private record Row(long id, long termId, long studentId, long bedId, boolean resident, String renewal, Instant at) {
    }

    private final JdbcClient jdbc;
    private final Inventory inventory;
    private final TermCatalog terms;
    private final UserDirectory users;
    private final Clock clock;

    RoomResidentRecords(JdbcClient jdbc, Inventory inventory, TermCatalog terms, UserDirectory users, Clock clock) {
        this.jdbc = jdbc;
        this.inventory = inventory;
        this.terms = terms;
        this.users = users;
        this.clock = clock;
    }

    @Override
    public String section() {
        return "residents";
    }

    @Override
    public List<Item> of(long roomId, int limit) {
        Map<Long, Inventory.BedSlot> beds = inventory.bedsOfRoom(roomId).stream()
                .collect(Collectors.toMap(Inventory.BedSlot::bedId, b -> b));
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        Map<Long, TermSummary> open = terms.publishedTerms().stream().filter(t -> !t.stayEnd().isBefore(today))
                .collect(Collectors.toMap(TermSummary::id, t -> t, (a, b) -> a));
        if (beds.isEmpty() || open.isEmpty()) {
            return List.of();
        }
        List<Row> rows = jdbc.sql("""
                SELECT id, term_id, student_id, bed_id, resident_at IS NOT NULL AS resident, renewal, allocated_at
                FROM asg_allocation WHERE bed_id IN (:beds) AND term_id IN (:terms) AND status = 'ACTIVE'
                """).param("beds", List.copyOf(beds.keySet())).param("terms", List.copyOf(open.keySet()))
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("student_id"),
                        rs.getLong("bed_id"), rs.getBoolean("resident"), rs.getString("renewal"),
                        rs.getTimestamp("allocated_at").toInstant()))
                .list();
        Map<Long, String> names = users.displayNames(rows.stream().map(Row::studentId).collect(Collectors.toSet()));
        return rows.stream()
                .sorted(Comparator.comparing((Row r) -> open.get(r.termId()).stayStart())
                        .thenComparing(r -> beds.get(r.bedId()).bedLabel()))
                .limit(limit)
                .map(r -> new Item("student", String.valueOf(r.studentId()), names.get(r.studentId()),
                        "Bed " + beds.get(r.bedId()).bedLabel() + " · " + open.get(r.termId()).name(), status(r), r.at()))
                .toList();
    }

    private static String status(Row r) {
        if (r.renewal() != null) {
            return r.renewal().equals("CONTINUING") ? "Continuing" : "Awaiting extension";
        }
        return r.resident() ? StudentAllocationService.RESIDENT : StudentAllocationService.UNPAID;
    }
}
