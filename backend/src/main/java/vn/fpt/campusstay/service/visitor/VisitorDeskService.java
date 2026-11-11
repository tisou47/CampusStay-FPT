package vn.fpt.campusstay.service.visitor;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.common.audit.ActorResolver;
import vn.fpt.campusstay.common.i18n.Messages;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.visitor.FamilyDays.Day;
import vn.fpt.campusstay.service.visitor.FamilyDays.Registration;
import vn.fpt.campusstay.service.visitor.FamilyDays.Slot;
import vn.fpt.campusstay.service.visitor.FamilyDays.Visitor;

/**
 * The Family Day visitor desk (ADR-29, contract A-69): Staff of the Block (and Managers) find a guest by their pass or
 * in the list, check them in once (identity paper checked, inside their time slot) and out. Each guest is checked in
 * and out on their own; a pass works once. Refused passes are written to the Audit Log even though nothing changes.
 */
@Service
public class VisitorDeskService {

    public record VisitorItem(String id, String familyDayId, String fullName, String relationship, int birthYear,
            String studentName, String studentCode, String room, String slotId, Instant slotStartsAt,
            Instant slotEndsAt, String status, boolean overdue, Instant checkedInAt, String checkedInBy,
            Instant checkedOutAt, String checkedOutBy, String checkOutNote) {
    }

    public record DeskCounts(long notArrived, long inside, long overdue, long checkedOut, long noShow) {
    }

    public record VisitorPage(List<VisitorItem> items, long total, DeskCounts counts, List<String> statuses) {
    }

    /** What the desk sees after scanning a pass. @param problem why the guest cannot be checked in now, or null */
    public record PassCheck(VisitorItem visitor, String familyDayTitle, boolean canCheckIn, boolean canCheckOut,
            String problem) {
    }

    static final List<String> STATUSES = List.of("Not arrived", "Checked in", "Overdue", "Checked out", "No-show",
            "Cancelled");

    private final JdbcClient jdbc;
    private final FamilyDays days;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final UserDirectory users;
    private final Residences residences;
    private final Parameters parameters;
    private final AuditLog audit;
    private final ActorResolver actors;
    private final Messages messages;
    private final Clock clock;

    public VisitorDeskService(JdbcClient jdbc, FamilyDays days, CurrentUser currentUser, BlockScope blockScope,
            UserDirectory users, Residences residences, Parameters parameters, AuditLog audit, ActorResolver actors,
            Messages messages, Clock clock) {
        this.jdbc = jdbc;
        this.days = days;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.users = users;
        this.residences = residences;
        this.parameters = parameters;
        this.audit = audit;
        this.actors = actors;
        this.messages = messages;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- the list

    /**
     * The guests of a Family Day for the desk. Cancelled guests only when asked for.
     *
     * @param status a label of {@code statuses}; {@code Overdue} = still inside after their time slot
     * @param q      guest or student name, or student code
     */
    @Transactional(readOnly = true)
    public VisitorPage visitors(String familyDayId, String slotId, String status, String q, PageQuery page) {
        currentUser.require(Permission.FAMILY_DAY_DESK);
        Day day = days.get(FamilyDays.id(familyDayId, "Family Day"));
        blockScope.check(day.buildingId());
        String wanted = status == null || status.isBlank() ? null : STATUSES.stream()
                .filter(s -> s.equalsIgnoreCase(status.trim())).findFirst()
                .orElseThrow(() -> FieldErrors.single("status", "Choose one of: " + String.join(", ", STATUSES) + "."));
        Long slotFilter = slotId == null || slotId.isBlank() ? null : FamilyDays.id(slotId, "time slot");
        Instant now = Instant.now(clock);
        List<VisitorItem> all = items(day, now);
        DeskCounts counts = new DeskCounts(count(all, "Not arrived"), count(all, "Checked in"),
                all.stream().filter(VisitorItem::overdue).count(), count(all, "Checked out"), count(all, "No-show"));
        String needle = q == null || q.isBlank() ? null : q.trim().toLowerCase(Locale.ROOT);
        List<VisitorItem> shown = all.stream()
                .filter(v -> slotFilter == null || v.slotId().equals(String.valueOf(slotFilter)))
                .filter(v -> wanted == null ? !v.status().equals("Cancelled")
                        : wanted.equals("Overdue") ? v.overdue() : wanted.equals(v.status()))
                .filter(v -> needle == null || contains(v.fullName(), needle) || contains(v.studentName(), needle)
                        || contains(v.studentCode(), needle))
                .toList();
        return new VisitorPage(shown.stream().skip(page.offset()).limit(page.limit()).toList(), shown.size(), counts,
                STATUSES);
    }

    private static long count(List<VisitorItem> items, String status) {
        return items.stream().filter(v -> v.status().equals(status)).count();
    }

    private static boolean contains(String value, String needle) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(needle);
    }

    // ---------------------------------------------------------------- scan a pass

    /** Finds the guest a pass belongs to and says whether they can come in now. Changes nothing. */
    @Transactional(readOnly = true)
    public PassCheck verify(String token) {
        currentUser.require(Permission.FAMILY_DAY_DESK);
        String value = token == null ? "" : token.trim();
        Visitor v = value.isEmpty() || value.length() > 64 ? null : days.visitorByPass(value).orElse(null);
        if (v == null) {
            audit.recordIndependently(actors.currentActor(), "Family Day pass refused", AuditLog.Tone.WARNING,
                    "FamilyDayPass", null, null, Map.of("why", "Unknown pass"));
            throw new ApiException(org.springframework.http.HttpStatus.NOT_FOUND, "VISITOR_PASS_UNKNOWN",
                    "This pass is not a Family Day pass of CampusStay.");
        }
        Registration r = days.registration(v.registrationId()).orElseThrow();
        Day day = days.get(r.dayId());
        blockScope.check(day.buildingId());
        Instant now = Instant.now(clock);
        Slot slot = days.slot(r.slotId()).orElseThrow();
        Refusal refusal = refusal(day, r, v, slot, now);
        VisitorItem item = item(day, v, now);
        return new PassCheck(item, day.title(), refusal == null, v.status().equals("CHECKED_IN"),
                // A 200 body is not an error, so LocalizedErrors leaves it: the desk reads the problem in its language.
                refusal == null ? null : messages.forRequest(refusal.message()));
    }

    // ---------------------------------------------------------------- check in and out

    /**
     * Lets a guest in: the desk checked their identity paper, the Family Day is published, the pass is live and unused,
     * and it is their time slot (from {@code family_day.early_minutes} before it starts until it ends). The UPDATE only
     * takes a guest not arrived, so two desks scanning the same pass at once let them in once.
     */
    @Transactional
    public VisitorItem checkIn(String id, Boolean identityChecked) {
        AuthenticatedUser user = currentUser.require(Permission.FAMILY_DAY_DESK);
        if (!Boolean.TRUE.equals(identityChecked)) {
            throw FieldErrors.single("identityChecked",
                    "Check the guest's identity paper against their name before letting them in.");
        }
        Visitor v = days.visitor(FamilyDays.id(id, "guest")).orElseThrow(() -> ApiException.notFound("This guest does not exist."));
        Registration r = days.registration(v.registrationId()).orElseThrow();
        Day day = days.lock(r.dayId());
        blockScope.check(day.buildingId());
        Instant now = Instant.now(clock);
        Slot slot = days.slot(r.slotId()).orElseThrow();
        Refusal refusal = refusal(day, r, days.visitor(v.id()).orElseThrow(), slot, now);
        if (refusal != null) {
            audit.recordIndependently(actors.currentActor(), "Family Day check-in refused", AuditLog.Tone.WARNING,
                    "FamilyDayGuest", v.id(), day.title(), Map.of("why", refusal.message()));
            throw ApiException.conflict(refusal.code(), refusal.message());
        }
        int changed = jdbc.sql("""
                UPDATE vis_visitor SET status = 'CHECKED_IN', checked_in_at = :now, checked_in_by = :by
                WHERE id = :id AND status = 'NOT_ARRIVED'
                """).param("now", FamilyDayService.ts(now)).param("by", user.userId()).param("id", v.id()).update();
        if (changed == 0) {
            throw ApiException.conflict("VISITOR_ALREADY_IN", "This guest is already checked in.");
        }
        audit.record("Family Day guest checked in", AuditLog.Tone.SUCCESS, "FamilyDayGuest", v.id(), day.title(),
                Map.of("slot", slot.label()));
        return item(day, days.visitor(v.id()).orElseThrow(), now);
    }

    /**
     * Records that a guest left. A guest who left without passing the desk is closed with a note saying so: the time
     * recorded is when the desk closes the visit, never a guessed one.
     */
    @Transactional
    public VisitorItem checkOut(String id, String note) {
        AuthenticatedUser user = currentUser.require(Permission.FAMILY_DAY_DESK);
        String text = FamilyDayService.trim(note);
        if (text != null && text.length() > 500) {
            throw FieldErrors.single("note", "Keep the note under 500 characters.");
        }
        Visitor v = days.visitor(FamilyDays.id(id, "guest")).orElseThrow(() -> ApiException.notFound("This guest does not exist."));
        Registration r = days.registration(v.registrationId()).orElseThrow();
        Day day = days.lock(r.dayId());
        blockScope.check(day.buildingId());
        Instant now = Instant.now(clock);
        int changed = jdbc.sql("""
                UPDATE vis_visitor SET status = 'CHECKED_OUT', checked_out_at = :now, checked_out_by = :by,
                       check_out_note = :note
                WHERE id = :id AND status = 'CHECKED_IN'
                """).param("now", FamilyDayService.ts(now)).param("by", user.userId()).param("note", text)
                .param("id", v.id()).update();
        if (changed == 0) {
            throw ApiException.conflict("VISITOR_NOT_INSIDE", "This guest is not checked in.");
        }
        Map<String, Object> change = new LinkedHashMap<>();
        if (text != null) {
            change.put("note", text);
        }
        audit.record("Family Day guest checked out", text == null ? AuditLog.Tone.SUCCESS : AuditLog.Tone.WARNING,
                "FamilyDayGuest", v.id(), day.title(), change);
        return item(day, days.visitor(v.id()).orElseThrow(), now);
    }

    // ---------------------------------------------------------------- rules

    private record Refusal(String code, String message) {
    }

    private Refusal refusal(Day day, Registration r, Visitor v, Slot slot, Instant now) {
        if (day.status().equals("CANCELLED") || r.status().equals("CANCELLED") || v.status().equals("CANCELLED")) {
            return new Refusal("VISITOR_PASS_REVOKED", "This pass was cancelled and no longer works.");
        }
        if (!day.status().equals("PUBLISHED")) {
            return new Refusal("FAMILY_DAY_ENDED", "This Family Day is over.");
        }
        switch (v.status()) {
            case "CHECKED_IN" -> {
                return new Refusal("VISITOR_ALREADY_IN", "This guest is already checked in.");
            }
            case "CHECKED_OUT" -> {
                return new Refusal("VISITOR_PASS_USED", "This pass was already used: the guest came and left.");
            }
            case "NO_SHOW" -> {
                return new Refusal("FAMILY_DAY_ENDED", "This Family Day is over.");
            }
            default -> {
            }
        }
        Instant opens = slot.startsAt().minus(Duration.ofMinutes(parameters.intValue("family_day.early_minutes")));
        if (now.isBefore(opens)) {
            return new Refusal("VISITOR_TOO_EARLY", "This guest's time slot is " + slot.label()
                    + ". Check them in from " + FamilyDays.TIME.format(opens) + ".");
        }
        if (!now.isBefore(slot.endsAt())) {
            return new Refusal("VISITOR_SLOT_OVER", "This guest's time slot ended at "
                    + FamilyDays.TIME.format(slot.endsAt()) + ".");
        }
        return null;
    }

    // ---------------------------------------------------------------- views

    private List<VisitorItem> items(Day day, Instant now) {
        List<Registration> regs = days.registrations(day.id());
        Map<Long, Registration> byId = regs.stream().collect(Collectors.toMap(Registration::id, Function.identity()));
        Map<Long, Slot> slots = days.slots(day.id()).stream().collect(Collectors.toMap(Slot::id, Function.identity()));
        List<Visitor> visitors = days.visitors(byId.keySet());
        Set<Long> studentIds = regs.stream().map(Registration::studentId).collect(Collectors.toSet());
        Map<Long, UserDirectory.Student> students = users.students(studentIds);
        Map<Long, Residences.Residence> homes = residences.current(studentIds);
        Map<Long, String> staff = staffNames(visitors);
        List<VisitorItem> items = new ArrayList<>();
        for (Visitor v : visitors) {
            Registration r = byId.get(v.registrationId());
            items.add(view(day, v, r, slots.get(r.slotId()), students.get(r.studentId()), homes.get(r.studentId()),
                    staff, now));
        }
        items.sort(Comparator.comparing(VisitorItem::slotStartsAt).thenComparing(VisitorItem::studentName,
                Comparator.nullsLast(Comparator.naturalOrder())).thenComparing(VisitorItem::id));
        return items;
    }

    private VisitorItem item(Day day, Visitor v, Instant now) {
        Registration r = days.registration(v.registrationId()).orElseThrow();
        Slot slot = days.slot(r.slotId()).orElseThrow();
        return view(day, v, r, slot, users.students(Set.of(r.studentId())).get(r.studentId()),
                residences.current(r.studentId()).orElse(null), staffNames(List.of(v)), now);
    }

    private Map<Long, String> staffNames(List<Visitor> visitors) {
        Set<Long> ids = new HashSet<>();
        for (Visitor v : visitors) {
            if (v.checkedInBy() != null) {
                ids.add(v.checkedInBy());
            }
            if (v.checkedOutBy() != null) {
                ids.add(v.checkedOutBy());
            }
        }
        return ids.isEmpty() ? Map.of() : users.displayNames(ids);
    }

    private static VisitorItem view(Day day, Visitor v, Registration r, Slot slot, UserDirectory.Student s,
            Residences.Residence home, Map<Long, String> staff, Instant now) {
        return new VisitorItem(String.valueOf(v.id()), String.valueOf(day.id()), v.fullName(), v.relationship(),
                v.birthYear(), s == null ? null : s.name(), s == null ? null : s.studentCode(),
                home == null ? null : home.room(), String.valueOf(r.slotId()), slot.startsAt(), slot.endsAt(),
                FamilyDays.visitorStatus(v, slot, now), FamilyDays.overdue(v, slot, now), v.checkedInAt(),
                v.checkedInBy() == null ? null : staff.get(v.checkedInBy()), v.checkedOutAt(),
                v.checkedOutBy() == null ? null : staff.get(v.checkedOutBy()), v.checkOutNote());
    }
}
