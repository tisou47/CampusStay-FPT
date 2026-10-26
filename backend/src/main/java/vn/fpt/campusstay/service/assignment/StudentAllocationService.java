package vn.fpt.campusstay.service.assignment;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.BlockSettings;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.exception.ApiException;

/** The student's My Room screen: {@code GET /students/me/allocation}. */
@Service
public class StudentAllocationService {

    public record TermRef(String id, String name, LocalDate stayStart, LocalDate stayEnd, Instant resultsPublishedAt) {
    }

    /**
     * @param status        {@code Assigned – unpaid}, {@code Paid – waiting for the door code} (the check-in start or
     *                      the Room's code has not come), then {@code Resident} (spec §7)
     * @param pass          the check-in pass payload the mobile app shows as a QR code ({@code CSTAY-PASS:<allocationId>})
     * @param residentSince when the door code was released (or the desk checked the student in)
     * @param codeReleased  the door code of the Room is released to the student
     */
    public record AllocationView(String room, String bed, String block, String blockLabel, int floor,
            String roomTypeName, String roomClassName, List<String> amenities, Instant allocatedAt, String status,
            String pass, Instant residentSince, boolean codeReleased) {
    }

    public record Roommate(String name, String bed) {
    }

    public record CheckIn(LocalDate start, LocalDate end, String deskHours, String location, Instant checkedInAt) {
    }

    public record Balance(String invoiceId, long amount, String status, Instant dueAt, Instant paidAt) {
    }

    public record ApplicationRef(String id, String status) {
    }

    /**
     * @param stayTerms   Gia hạn of the Application (Terms the student wants to stay), null without one
     * @param termination the termination of the stay (not a cancelled one), null without one
     */
    public record MyRoom(TermRef term, AllocationView allocation, List<Roommate> roommates, Integer roommateCapacity,
            CheckIn checkIn, Balance balance, ApplicationRef application, String rulesUrl, Integer stayTerms,
            TerminationService.MyTermination termination) {
    }

    static final String UNPAID = "Assigned – unpaid";
    static final String PAID = "Paid – waiting for the door code";
    static final String RESIDENT = "Resident";

    private record Row(long id, Long applicationId, long bedId, Instant allocatedAt, Instant checkedInAt,
            Instant residentAt, Instant codeReleasedAt) {
    }

    private static final DateTimeFormatter HOURS = DateTimeFormatter.ofPattern("HH:mm");

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final TermCatalog terms;
    private final Applications applications;
    private final Inventory inventory;
    private final Catalog catalog;
    private final BlockSettings blockSettings;
    private final Billing billing;
    private final UserDirectory users;
    private final TerminationService terminations;

    public StudentAllocationService(JdbcClient jdbc, CurrentUser currentUser, TermCatalog terms,
            Applications applications, Inventory inventory, Catalog catalog, BlockSettings blockSettings,
            Billing billing, UserDirectory users, TerminationService terminations) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.terms = terms;
        this.applications = applications;
        this.inventory = inventory;
        this.catalog = catalog;
        this.blockSettings = blockSettings;
        this.billing = billing;
        this.users = users;
        this.terminations = terminations;
    }

    /** @param termId null = the Term of the student's active Allocation, else the one open for registration */
    @Transactional(readOnly = true)
    public MyRoom mine(Long termId) {
        long me = currentUser.require(Role.STUDENT).userId();
        TermSummary term = term(me, termId);
        if (term == null) {
            return new MyRoom(null, null, List.of(), null, null, null, null, null, null, null);
        }
        Optional<Row> row = jdbc.sql("""
                SELECT id, application_id, bed_id, allocated_at, checked_in_at, resident_at, code_released_at
                FROM asg_allocation
                WHERE student_id = :me AND term_id = :term AND status = 'ACTIVE'
                """).param("me", me).param("term", term.id())
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getObject("application_id", Long.class),
                        rs.getLong("bed_id"), instant(rs.getTimestamp("allocated_at")),
                        instant(rs.getTimestamp("checked_in_at")), instant(rs.getTimestamp("resident_at")),
                        instant(rs.getTimestamp("code_released_at"))))
                .optional();
        Optional<Applications.Candidate> app = row.map(Row::applicationId).flatMap(id -> id == null ? Optional.empty()
                : applications.find(id)).or(() -> applications.live(me, term.id()));
        ApplicationRef appRef = app.map(a -> new ApplicationRef(a.code(), label(a.status()))).orElse(null);
        Integer stayTerms = app.map(Applications.Candidate::stayTerms).orElse(null);
        TermRef termRef = new TermRef(String.valueOf(term.id()), term.name(), term.stayStart(), term.stayEnd(),
                term.resultsPublishedAt());
        Inventory.BedSlot bed = row.map(r -> inventory.beds(term.id(), List.of(r.bedId())).get(r.bedId())).orElse(null);
        if (bed == null) {
            return new MyRoom(termRef, null, List.of(), null, null, null, appRef, null, stayTerms, null);
        }
        Row allocation = row.get();
        Catalog.RoomClassInfo roomClass = catalog.roomClasses().stream().filter(c -> c.id() == bed.roomClassId())
                .findFirst().orElse(null);
        String typeName = catalog.roomTypes().stream().filter(t -> t.id() == bed.roomTypeId())
                .map(Catalog.RoomTypeInfo::name).findFirst().orElse(null);
        AllocationView view = new AllocationView(bed.roomCode(), bed.bedLabel(), bed.block(), "Block " + bed.block(),
                bed.floor(), typeName, roomClass == null ? null : roomClass.name(),
                roomClass == null ? List.of() : roomClass.amenities(), allocation.allocatedAt(),
                allocation.residentAt() != null ? RESIDENT : billing.checkInDue(allocation.id()).isPresent() ? UNPAID
                        : PAID, "CSTAY-PASS:" + allocation.id(),
                allocation.residentAt(), allocation.codeReleasedAt() != null);

        List<Inventory.BedSlot> roomBeds = inventory.bedsOfRoom(bed.roomId());
        Map<Long, String> labels = roomBeds.stream()
                .collect(Collectors.toMap(Inventory.BedSlot::bedId, Inventory.BedSlot::bedLabel));
        List<Map.Entry<Long, Long>> others = labels.isEmpty() ? List.of() : jdbc.sql("""
                SELECT bed_id, student_id FROM asg_allocation
                WHERE term_id = :term AND status = 'ACTIVE' AND student_id <> :me AND bed_id IN (:beds)
                """).param("term", term.id()).param("me", me).param("beds", labels.keySet())
                .query((rs, i) -> Map.entry(rs.getLong("bed_id"), rs.getLong("student_id"))).list();
        Map<Long, String> names = users.displayNames(others.stream().map(Map.Entry::getValue).toList());
        List<Roommate> roommates = others.stream()
                .map(e -> new Roommate(names.get(e.getValue()), labels.get(e.getKey())))
                .sorted(Comparator.comparing(Roommate::bed))
                .toList();

        String deskHours = blockSettings.forBlock(bed.buildingId())
                .map(s -> s.deskOpens().format(HOURS) + "–" + s.deskCloses().format(HOURS)).orElse(null);
        CheckIn checkIn = term.checkInStart() == null && allocation.checkedInAt() == null ? null
                : new CheckIn(term.checkInStart(), term.checkInEnd(), deskHours, "Reception, Block " + bed.block(),
                        allocation.checkedInAt());

        Balance balance = app.flatMap(a -> billing.invoicesOfApplication(a.applicationId()).stream()
                .filter(i -> i.type().equals("balance") && !i.status().equals("Void"))
                .max(Comparator.comparing(Billing.InvoiceLine::id)))
                .map(i -> new Balance(i.code(), i.amount(), i.status(), i.dueAt(), i.paidAt()))
                .orElse(null);
        return new MyRoom(termRef, view, roommates, Math.max(0, roomBeds.size() - 1), checkIn, balance, appRef, null,
                stayTerms, terminations.ofAllocation(allocation.id()).orElse(null));
    }

    private TermSummary term(long me, Long termId) {
        if (termId != null) {
            return terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        }
        return jdbc.sql("""
                SELECT term_id FROM asg_allocation WHERE student_id = :me AND status = 'ACTIVE'
                ORDER BY allocated_at DESC LIMIT 1
                """).param("me", me).query(Long.class).optional()
                .flatMap(terms::findPublished)
                .or(terms::openForRegistration)
                .or(() -> terms.publishedTerms().stream().filter(TermSummary::current).findFirst())
                .orElse(null);
    }

    /** {@code UNDER_REVIEW} → {@code Under Review}: the contract labels are the words in title case. */
    private static String label(String status) {
        return Arrays.stream(status.toLowerCase(Locale.ROOT).split("_"))
                .map(w -> Character.toUpperCase(w.charAt(0)) + w.substring(1))
                .collect(Collectors.joining(" "));
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
