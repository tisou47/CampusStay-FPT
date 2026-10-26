package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.inventory.RoomClassChanges;
import vn.fpt.campusstay.service.setting.Catalog;

/**
 * The turnover between a Term and the next (spec §5.1 M9, §6.16): leavers check out by the Term's check-out date
 * (those late are overdue and escalated), movers move to their next-Term Bed, and every Room whose residents change
 * needs a meter reading and a new door code before the next residents receive it; Rooms whose class changes are
 * listed too (their furniture moves). Rooms whose furniture does not match their next-Term Room Class are a Manager's
 * task (spec §6.11 step 6). Staff see their Blocks.
 */
@Service
public class TurnoverService {

    public record TermRef(String id, String name) {
    }

    public record Person(String name, String studentCode) {
    }

    /** @param status {@code To check out}, {@code Checked out} or {@code Overdue} */
    public record Leaver(String allocationId, Person student, String room, String bed, String block, String status) {
    }

    /** @param fee the next-Term fee's status, null before the fees are issued */
    public record Mover(Person student, String from, String to, String fee, boolean moved) {
    }

    /**
     * @param doorCodeReady the Room's code is confirmed with no change waiting (residents can receive it)
     * @param matches       the Room's furniture matches its Room Class of the next Term
     */
    public record RoomChange(String room, String block, int leaving, int arriving, boolean doorCodeReady,
            String roomClass, boolean matches, LocalDate lastMeterCut) {
    }

    public record Counts(long leavers, long checkedOut, long overdue, long movers, long staying, long arriving,
            long rooms, long codesToSet, long notMatching) {
    }

    public record Turnover(TermRef term, TermRef previousTerm, LocalDate checkOutBy, LocalDate checkInStart,
            Counts counts, List<Leaver> leavers, List<Mover> movers, List<RoomChange> rooms) {
    }

    private record Held(long id, long studentId, long bedId, String status, String endReason, boolean resident,
            String renewal) {
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final JdbcStays stays;
    private final Inventory inventory;
    private final RoomClassChanges classes;
    private final Catalog catalog;
    private final Billing billing;
    private final UserDirectory users;
    private final Clock clock;

    public TurnoverService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope,
            JdbcStays stays, Inventory inventory, RoomClassChanges classes, Catalog catalog, Billing billing,
            UserDirectory users, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.stays = stays;
        this.inventory = inventory;
        this.classes = classes;
        this.catalog = catalog;
        this.billing = billing;
        this.users = users;
        this.clock = clock;
    }

    /** @param termId the next Term (whose requests window prepares it) */
    @Transactional(readOnly = true)
    public Turnover overview(long termId, String block) {
        currentUser.require(Permission.DESK);
        Set<Long> scope = blockScope.resolve(block).ids();
        Stays.Window w = stays.window(termId).orElseThrow(() -> ApiException.notFound(
                "This Term has no requests window: it has no renewal milestones."));
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));

        List<Held> before = held(w.previousTermId());
        List<Held> after = held(w.termId());
        Map<Long, Inventory.BedSlot> beds = new HashMap<>();
        beds.putAll(inventory.beds(w.previousTermId(), before.stream().map(Held::bedId).toList()));
        Map<Long, Inventory.BedSlot> next = inventory.beds(w.termId(), after.stream().map(Held::bedId).toList());
        Map<Long, Held> nextOf = new HashMap<>();
        after.stream().filter(h -> h.status().equals("ACTIVE")).forEach(h -> nextOf.put(h.studentId(), h));

        List<Held> residents = before.stream().filter(h -> h.resident()
                && (h.status().equals("ACTIVE") || "CHECK_OUT".equals(h.endReason())
                        || "TERM_END".equals(h.endReason()))).toList();
        Map<Long, UserDirectory.Student> students = users.students(Stream.concat(residents.stream(), after.stream())
                .map(Held::studentId).collect(Collectors.toSet()));

        List<Leaver> leavers = new ArrayList<>();
        List<Mover> movers = new ArrayList<>();
        long staying = 0;
        Map<Long, int[]> changes = new LinkedHashMap<>();
        Map<Long, Billing.InvoiceLine> fees = billing.termFees(after.stream().map(Held::id).toList());
        for (Held h : residents) {
            Inventory.BedSlot from = beds.get(h.bedId());
            if (from == null) {
                continue;
            }
            Held n = nextOf.get(h.studentId());
            Inventory.BedSlot to = n == null ? null : next.get(n.bedId());
            if (to == null) {
                if (!scope.contains(from.buildingId())) {
                    continue;
                }
                String status = "CHECK_OUT".equals(h.endReason()) ? "Checked out"
                        : today.isAfter(w.previousCheckOutBy()) ? "Overdue" : "To check out";
                leavers.add(new Leaver(String.valueOf(h.id()), person(students.get(h.studentId())), from.roomCode(),
                        from.bedLabel(), from.block(), status));
                changes.computeIfAbsent(from.roomId(), r -> new int[2])[0]++;
            } else if (to.roomId() != from.roomId()) {
                if (!scope.contains(from.buildingId()) && !scope.contains(to.buildingId())) {
                    continue;
                }
                Billing.InvoiceLine fee = fees.get(n.id());
                movers.add(new Mover(person(students.get(h.studentId())), from.code(), to.code(),
                        fee == null ? null : fee.status(), !h.status().equals("ACTIVE")));
                changes.computeIfAbsent(from.roomId(), r -> new int[2])[0]++;
                changes.computeIfAbsent(to.roomId(), r -> new int[2])[1]++;
            } else if (scope.contains(from.buildingId())) {
                staying++;
            }
        }
        Set<Long> continuing = residents.stream().map(Held::studentId).collect(Collectors.toCollection(HashSet::new));
        long arriving = 0;
        for (Held h : after) {
            Inventory.BedSlot to = next.get(h.bedId());
            if (!h.status().equals("ACTIVE") || to == null || continuing.contains(h.studentId())
                    || !scope.contains(to.buildingId())) {
                continue;
            }
            arriving++;
            changes.computeIfAbsent(to.roomId(), r -> new int[2])[1]++;
        }
        // Rooms whose class changes for the next Term: their furniture moves at the turnover, residents or not.
        Map<Long, Inventory.BedSlot> classRooms = new HashMap<>();
        for (long roomId : classes.changingClass(w.termId(), w.previousTermId())) {
            List<Inventory.BedSlot> slots = inventory.bedsOfRoom(w.termId(), roomId);
            if (changes.containsKey(roomId) || slots.isEmpty() || !scope.contains(slots.getFirst().buildingId())) {
                continue;
            }
            classRooms.put(roomId, slots.getFirst());
            changes.put(roomId, new int[2]);
        }
        List<Long> roomIds = List.copyOf(changes.keySet());
        Set<Long> ready = inventory.doorCodeReady(roomIds);
        Map<Long, Boolean> matches = classes.conforms(w.termId(), roomIds);
        Map<Long, LocalDate> cuts = billing.lastMeterCuts(roomIds);
        Map<Long, String> classNames = catalog.roomClasses().stream()
                .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name));
        Map<Long, Inventory.BedSlot> roomBeds = new HashMap<>();
        Stream.concat(beds.values().stream(), next.values().stream()).forEach(b -> roomBeds.putIfAbsent(b.roomId(), b));
        classRooms.forEach(roomBeds::putIfAbsent);
        List<RoomChange> rooms = roomIds.stream().map(id -> {
            Inventory.BedSlot b = roomBeds.get(id);
            int[] c = changes.get(id);
            return new RoomChange(b.roomCode(), b.block(), c[0], c[1], ready.contains(id),
                    classNames.get(classes.classOf(id, w.termId())), matches.getOrDefault(id, true), cuts.get(id));
        }).sorted(Comparator.comparing(RoomChange::room)).toList();
        leavers.sort(Comparator.comparing((Leaver l) -> l.status().equals("Checked out")).thenComparing(Leaver::room)
                .thenComparing(Leaver::bed));
        movers.sort(Comparator.comparing(Mover::from));
        Counts counts = new Counts(leavers.size(), leavers.stream().filter(l -> l.status().equals("Checked out")).count(),
                leavers.stream().filter(l -> l.status().equals("Overdue")).count(), movers.size(), staying, arriving,
                rooms.size(), rooms.stream().filter(r -> !r.doorCodeReady()).count(),
                rooms.stream().filter(r -> !r.matches()).count());
        return new Turnover(new TermRef(String.valueOf(w.termId()), w.termName()),
                new TermRef(String.valueOf(w.previousTermId()), w.previousTermName()), w.previousCheckOutBy(),
                w.checkInStart(), counts, leavers, movers, rooms);
    }

    /**
     * Records the meter reading of a Room whose residents change at the turnover (spec §5.1 M9), so the month's
     * Utility is split between those who leave and those who arrive.
     */
    @Transactional
    public void meterCut(String room, BigDecimal electricity, BigDecimal water) {
        AuthenticatedUser user = currentUser.require(Permission.DESK);
        String code = room == null ? "" : room.trim();
        Inventory.BedSlot bed = blockScope.resolve(null).ids().stream()
                .flatMap(b -> inventory.bedsOfBuilding(b).stream())
                .filter(b -> b.roomCode().equalsIgnoreCase(code)).findFirst()
                .orElseThrow(() -> FieldErrors.single("room", "Choose a Room of your Blocks."));
        billing.recordMeterCut(bed.roomId(), bed.roomCode(), electricity, water, "TURNOVER", null, user.userId(), "");
    }

    private List<Held> held(long termId) {
        return jdbc.sql("""
                SELECT id, student_id, bed_id, status, end_reason, resident_at IS NOT NULL AS resident, renewal
                FROM asg_allocation WHERE term_id = :t AND (status = 'ACTIVE' OR end_reason IN ('CHECK_OUT', 'TERM_END'))
                """).param("t", termId)
                .query((rs, i) -> new Held(rs.getLong("id"), rs.getLong("student_id"), rs.getLong("bed_id"),
                        rs.getString("status"), rs.getString("end_reason"), rs.getBoolean("resident"),
                        rs.getString("renewal")))
                .list();
    }

    private static Person person(UserDirectory.Student s) {
        return new Person(s == null ? null : s.name(), s == null ? null : s.studentCode());
    }
}
