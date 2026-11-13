package vn.fpt.campusstay.service.visitor;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.FamilyDayRegistered;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.security.Tokens;
import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.visitor.FamilyDays.Day;
import vn.fpt.campusstay.service.visitor.FamilyDays.Registration;
import vn.fpt.campusstay.service.visitor.FamilyDays.Slot;
import vn.fpt.campusstay.service.visitor.FamilyDays.Visitor;

/**
 * Family Days seen by a resident (ADR-29, contract A-69): the published ones of the Block they live in, and their own
 * registration. A registration within the time slot's places is approved at once and gives every guest a pass.
 */
@Service
public class StudentFamilyDayService {

    public record GuestInput(String fullName, String relationship, Integer birthYear) {
    }

    public record RegisterCommand(String slotId, List<GuestInput> guests) {
    }

    public record MyRegistrationSummary(String status, String slotId, Instant slotStartsAt, Instant slotEndsAt,
            int guests) {
    }

    public record MyFamilyDayItem(String id, String block, String title, String area, String status,
            Instant registrationOpensAt, Instant registrationClosesAt, Instant startsAt, Instant endsAt,
            MyRegistrationSummary registration) {
    }

    public record MyFamilyDays(boolean resident, List<MyFamilyDayItem> items) {
    }

    public record SlotChoice(String id, Instant startsAt, Instant endsAt, int remaining) {
    }

    /**
     * @param passToken         the value of the guest's QR, only while the pass may still be used
     * @param overdue           still inside after the time slot: the student asks them to leave and confirms they are safe
     * @param remindedAt        the last reminder the desk sent about this guest
     * @param safetyConfirmedAt when the student confirmed this guest is safe
     */
    public record MyGuest(String id, String fullName, String relationship, int birthYear, String status,
            String passToken, Instant checkedInAt, Instant checkedOutAt, boolean overdue, Instant remindedAt,
            Instant safetyConfirmedAt, String safetyNote) {
    }

    /** @param canConfirmSafety some guests are overdue and not yet confirmed safe */
    public record MyRegistration(String id, String status, String slotId, Instant slotStartsAt, Instant slotEndsAt,
            Instant createdAt, Instant cancelledAt, String cancelReason, boolean canCancel, boolean canConfirmSafety,
            List<MyGuest> guests) {
    }

    /** @param registerBlockedBy why the student cannot register now, or null when they can */
    public record MyFamilyDay(String id, String block, String title, String description, String area, String status,
            Instant registrationOpensAt, Instant registrationClosesAt, Instant startsAt, Instant endsAt, int maxGuests,
            int adultAge, List<SlotChoice> slots, boolean canRegister, String registerBlockedBy,
            MyRegistration registration) {
    }

    private final JdbcClient jdbc;
    private final FamilyDays days;
    private final CurrentUser currentUser;
    private final Residences residences;
    private final BlockDirectory blocks;
    private final Parameters parameters;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public StudentFamilyDayService(JdbcClient jdbc, FamilyDays days, CurrentUser currentUser, Residences residences,
            BlockDirectory blocks, Parameters parameters, ApplicationEventPublisher events, AuditLog audit,
            Clock clock) {
        this.audit = audit;
        this.jdbc = jdbc;
        this.days = days;
        this.currentUser = currentUser;
        this.residences = residences;
        this.blocks = blocks;
        this.parameters = parameters;
        this.events = events;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- reads

    /**
     * Published, closed and cancelled Family Days of the Block the student lives in (cancelled ones only when they had
     * registered), plus those of other Blocks they registered for before moving; never Drafts.
     */
    @Transactional(readOnly = true)
    public MyFamilyDays list() {
        long me = currentUser.require(Role.STUDENT).userId();
        Optional<Residences.Residence> home = residences.current(me).filter(Residences.Residence::resident);
        Set<Long> buildings = new HashSet<>(jdbc.sql("""
                SELECT DISTINCT d.building_id FROM vis_registration r JOIN vis_family_day d ON d.id = r.family_day_id
                WHERE r.student_id = :me
                """).param("me", me).query(Long.class).list());
        home.ifPresent(h -> buildings.add(h.buildingId()));
        List<Day> all = days.ofBuildings(buildings).stream().filter(d -> !d.status().equals("DRAFT")).toList();
        Map<Long, Registration> mine = days.registrationsOf(me, all.stream().map(Day::id).toList()).stream()
                .collect(Collectors.toMap(Registration::dayId, Function.identity(),
                        (a, b) -> a.status().equals("APPROVED") ? a : b));
        Map<Long, List<Slot>> slots = days.slots(all.stream().map(Day::id).toList()).stream()
                .collect(Collectors.groupingBy(Slot::dayId));
        Map<Long, Integer> guests = guestCounts(mine.values());
        Map<Long, String> codes = blocks.codesByIds(buildings);
        Instant now = Instant.now(clock);
        List<MyFamilyDayItem> items = new ArrayList<>();
        for (Day d : all) {
            Registration r = mine.get(d.id());
            boolean ownBlock = home.isPresent() && home.get().buildingId() == d.buildingId();
            if (r == null && (!ownBlock || d.status().equals("CANCELLED"))) {
                continue;
            }
            List<Slot> s = slots.getOrDefault(d.id(), List.of());
            MyRegistrationSummary summary = null;
            if (r != null) {
                Slot slot = s.stream().filter(x -> x.id() == r.slotId()).findFirst().orElseThrow();
                summary = new MyRegistrationSummary(FamilyDays.REGISTRATION_STATUSES.get(r.status()),
                        String.valueOf(slot.id()), slot.startsAt(), slot.endsAt(), guests.getOrDefault(r.id(), 0));
            }
            items.add(new MyFamilyDayItem(String.valueOf(d.id()), codes.get(d.buildingId()), d.title(), d.area(),
                    FamilyDays.status(d, s, now), d.opensAt(), d.closesAt(), FamilyDays.firstStart(s),
                    FamilyDays.lastEnd(s), summary));
        }
        items.sort(Comparator.comparing((MyFamilyDayItem i) -> i.startsAt() == null ? Instant.MAX : i.startsAt())
                .reversed());
        return new MyFamilyDays(home.isPresent(), items);
    }

    @Transactional(readOnly = true)
    public MyFamilyDay detail(String id) {
        long me = currentUser.require(Role.STUDENT).userId();
        return detail(visible(FamilyDays.id(id, "Family Day"), me), me);
    }

    // ---------------------------------------------------------------- register and cancel

    /**
     * Registers the student's guests for one time slot: the student lives in the Family Day's Block, registration is
     * open, they have no live registration yet, the guests are valid (a younger guest comes with an adult) and the slot
     * still has their places, taken in one UPDATE so two students never share the last ones.
     */
    @Transactional
    public MyFamilyDay register(String id, RegisterCommand cmd) {
        long me = currentUser.require(Role.STUDENT).userId();
        Day day = visible(FamilyDays.id(id, "Family Day"), me);
        Instant now = Instant.now(clock);
        String blocked = blockedBy(day, me, now);
        if (blocked != null) {
            throw ApiException.conflict(blockedCode(day, me, now), blocked);
        }
        List<Slot> slots = days.slots(day.id());
        List<GuestInput> guests = cmd.guests() == null ? List.of() : cmd.guests();
        FieldErrors errors = new FieldErrors();
        Slot slot = null;
        if (cmd.slotId() == null || cmd.slotId().isBlank()) {
            errors.add("slotId", "Choose a time slot.");
        } else {
            slot = slots.stream().filter(s -> String.valueOf(s.id()).equals(cmd.slotId().trim())).findFirst()
                    .orElse(null);
            errors.check(slot != null, "slotId", "Choose one of this Family Day's time slots.");
        }
        errors.check(!guests.isEmpty() && guests.size() <= day.maxGuests(), "guests",
                "Register from 1 to " + day.maxGuests() + " guests.");
        int adultAge = parameters.intValue("family_day.adult_age");
        int year = LocalDate.ofInstant(slot == null ? FamilyDays.firstStart(slots) : slot.startsAt(),
                TimeConfig.CAMPUS_ZONE).getYear();
        Set<String> seen = new HashSet<>();
        boolean adult = false, minor = false;
        for (int i = 0; i < guests.size(); i++) {
            GuestInput g = guests.get(i);
            String field = "guests[" + i + "]";
            String name = g == null ? null : FamilyDayService.trim(g.fullName());
            String relationship = g == null ? null : FamilyDayService.trim(g.relationship());
            Integer born = g == null ? null : g.birthYear();
            errors.check(name != null && name.length() >= 2 && name.length() <= 100, field + ".fullName",
                    "Write the guest's full name (2 to 100 characters).");
            errors.check(relationship != null && relationship.length() <= 40, field + ".relationship",
                    "Write how the guest is related to you (up to 40 characters).");
            boolean bornOk = born != null && born >= year - 120 && born <= year;
            errors.check(bornOk, field + ".birthYear", "Enter the guest's year of birth.");
            if (name != null && !seen.add(name.toLowerCase(Locale.ROOT) + "|" + born)) {
                errors.add(field + ".fullName", "This guest is already in the list.");
            }
            if (bornOk) {
                if (year - born >= adultAge) {
                    adult = true;
                } else {
                    minor = true;
                }
            }
        }
        if (minor && !adult && !errors.has("guests")) {
            errors.add("guests", "A guest under " + adultAge + " must come with an adult guest.");
        }
        errors.throwIfAny();
        if (!slot.startsAt().isAfter(now)) {
            throw ApiException.conflict("FAMILY_DAY_SLOT_STARTED", "This time slot has already started. Choose a later one.");
        }
        int taken = jdbc.sql("""
                UPDATE vis_time_slot SET booked = booked + :n WHERE id = :id AND booked + :n <= capacity
                """).param("n", guests.size()).param("id", slot.id()).update();
        if (taken == 0) {
            int left = days.slot(slot.id()).map(s -> s.capacity() - s.booked()).orElse(0);
            throw new ApiException(HttpStatus.CONFLICT, "FAMILY_DAY_SLOT_FULL", left == 0
                    ? "This time slot is full. Choose another one."
                    : "Only " + left + " places are left in this time slot. Choose another one or register fewer guests.",
                    Map.of("remaining", left));
        }
        long registration;
        try {
            registration = jdbc.sql("""
                    INSERT INTO vis_registration (family_day_id, time_slot_id, student_id, created_at)
                    VALUES (:d, :s, :me, :now) RETURNING id
                    """).param("d", day.id()).param("s", slot.id()).param("me", me)
                    .param("now", FamilyDayService.ts(now)).query(Long.class).single();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("FAMILY_DAY_ALREADY_REGISTERED",
                    "You have already registered guests for this Family Day.");
        }
        for (GuestInput g : guests) {
            jdbc.sql("""
                    INSERT INTO vis_visitor (registration_id, full_name, relationship, birth_year, pass_token)
                    VALUES (:r, :name, :relationship, :born, :token)
                    """).param("r", registration).param("name", g.fullName().trim())
                    .param("relationship", g.relationship().trim()).param("born", g.birthYear())
                    .param("token", Tokens.newToken()).update();
        }
        events.publishEvent(new FamilyDayRegistered(day.id(), day.title(), me, guests.size(), slot.label()));
        return detail(day, me);
    }

    /** The student cancels their registration before its time slot starts, while none of their guests came in. */
    @Transactional
    public void cancel(String id) {
        long me = currentUser.require(Role.STUDENT).userId();
        Day day = days.lock(visible(FamilyDays.id(id, "Family Day"), me).id());
        Registration r = days.registrationOf(day.id(), me).filter(x -> x.status().equals("APPROVED"))
                .orElseThrow(() -> ApiException.notFound("You have no registration for this Family Day."));
        Instant now = Instant.now(clock);
        Slot slot = days.slot(r.slotId()).orElseThrow();
        if (!now.isBefore(slot.startsAt())) {
            throw ApiException.conflict("FAMILY_DAY_SLOT_STARTED",
                    "Your time slot has already started, so the registration can no longer be cancelled.");
        }
        Registrations.cancel(jdbc, days, day, r, me, null, now);
    }

    // ---------------------------------------------------------------- guests past their time slot

    /**
     * The student confirms that their guests still inside after the time slot are safe (they asked them to leave, or
     * know where they are): every such guest not confirmed yet is marked, and the desk may now check them out.
     *
     * @param note what the student says, e.g. "My parents are at the gate", optional
     */
    @Transactional
    public MyFamilyDay confirmSafety(String id, String note) {
        long me = currentUser.require(Role.STUDENT).userId();
        String text = FamilyDayService.trim(note);
        if (text != null && text.length() > 500) {
            throw FieldErrors.single("note", "Keep the note under 500 characters.");
        }
        Day day = days.lock(visible(FamilyDays.id(id, "Family Day"), me).id());
        Registration r = days.registrationOf(day.id(), me).filter(x -> x.status().equals("APPROVED"))
                .orElseThrow(() -> ApiException.notFound("You have no registration for this Family Day."));
        Instant now = Instant.now(clock);
        Slot slot = days.slot(r.slotId()).orElseThrow();
        List<Visitor> waiting = days.visitors(List.of(r.id())).stream()
                .filter(v -> FamilyDays.overdue(v, slot, now) && v.safetyConfirmedAt() == null).toList();
        if (waiting.isEmpty()) {
            throw ApiException.conflict("FAMILY_DAY_NOTHING_TO_CONFIRM",
                    "None of your guests is inside after their time slot, so there is nothing to confirm.");
        }
        jdbc.sql("""
                UPDATE vis_visitor SET safety_confirmed_at = :now, safety_note = :note
                WHERE id IN (:ids) AND status = 'CHECKED_IN' AND safety_confirmed_at IS NULL
                """).param("now", FamilyDayService.ts(now)).param("note", text)
                .param("ids", waiting.stream().map(Visitor::id).toList()).update();
        Map<String, Object> change = new java.util.LinkedHashMap<>();
        change.put("guests", waiting.stream().map(Visitor::fullName).toList());
        if (text != null) {
            change.put("note", text);
        }
        audit.record("FAMILY_DAY_SAFETY_CONFIRMED", AuditLog.Tone.INFO, "FamilyDayRegistration", r.id(), day.title(),
                change);
        return detail(day, me);
    }

    // ---------------------------------------------------------------- helpers

    /** A Family Day the student may see: not a Draft, in the Block they live in or one they registered for; else 404. */
    private Day visible(long id, long me) {
        Day day = days.find(id).filter(d -> !d.status().equals("DRAFT")).orElseThrow(FamilyDays::missing);
        boolean registered = days.registrationOf(day.id(), me).isPresent();
        boolean ownBlock = residences.current(me).filter(Residences.Residence::resident)
                .map(h -> h.buildingId() == day.buildingId()).orElse(false);
        if (!registered && !(ownBlock && !day.status().equals("CANCELLED"))) {
            throw FamilyDays.missing();
        }
        return day;
    }

    /** Why the student cannot register now, or null. */
    private String blockedBy(Day day, long me, Instant now) {
        String code = blockedCode(day, me, now);
        if (code == null) {
            return null;
        }
        return switch (code) {
            case "FAMILY_DAY_NOT_RESIDENT" -> "Only residents of this Block can register guests for its Family Day.";
            case "FAMILY_DAY_ALREADY_REGISTERED" -> "You have already registered guests for this Family Day.";
            case "FAMILY_DAY_REGISTRATION_NOT_OPEN" -> "Registration opens on " + FamilyDays.DAY.format(day.opensAt())
                    + " at " + FamilyDays.TIME.format(day.opensAt()) + ".";
            default -> "Registration for this Family Day is closed.";
        };
    }

    private String blockedCode(Day day, long me, Instant now) {
        if (!day.status().equals("PUBLISHED") || !now.isBefore(day.closesAt())) {
            return "FAMILY_DAY_REGISTRATION_CLOSED";
        }
        if (now.isBefore(day.opensAt())) {
            return "FAMILY_DAY_REGISTRATION_NOT_OPEN";
        }
        boolean ownBlock = residences.current(me).filter(Residences.Residence::resident)
                .map(h -> h.buildingId() == day.buildingId()).orElse(false);
        if (!ownBlock) {
            return "FAMILY_DAY_NOT_RESIDENT";
        }
        if (days.registrationOf(day.id(), me).filter(r -> r.status().equals("APPROVED")).isPresent()) {
            return "FAMILY_DAY_ALREADY_REGISTERED";
        }
        return null;
    }

    private MyFamilyDay detail(Day day, long me) {
        Instant now = Instant.now(clock);
        List<Slot> slots = days.slots(day.id());
        Map<Long, Slot> bySlot = slots.stream().collect(Collectors.toMap(Slot::id, Function.identity()));
        MyRegistration mine = days.registrationOf(day.id(), me).map(r -> {
            Slot slot = bySlot.get(r.slotId());
            boolean live = r.status().equals("APPROVED") && day.status().equals("PUBLISHED");
            List<Visitor> vs = days.visitors(List.of(r.id()));
            boolean anyCame = vs.stream().anyMatch(v -> v.checkedInAt() != null);
            List<MyGuest> guests = vs.stream().map(v -> new MyGuest(String.valueOf(v.id()), v.fullName(),
                    v.relationship(), v.birthYear(), FamilyDays.visitorStatus(v, slot, now),
                    live && v.status().equals("NOT_ARRIVED") && now.isBefore(slot.endsAt()) ? v.passToken() : null,
                    v.checkedInAt(), v.checkedOutAt(), FamilyDays.overdue(v, slot, now), v.remindedAt(),
                    v.safetyConfirmedAt(), v.safetyNote())).toList();
            boolean toConfirm = vs.stream().anyMatch(v -> FamilyDays.overdue(v, slot, now) && v.safetyConfirmedAt() == null);
            return new MyRegistration(String.valueOf(r.id()), FamilyDays.REGISTRATION_STATUSES.get(r.status()),
                    String.valueOf(slot.id()), slot.startsAt(), slot.endsAt(), r.createdAt(), r.cancelledAt(),
                    r.cancelReason(), live && !anyCame && now.isBefore(slot.startsAt()), toConfirm, guests);
        }).orElse(null);
        String blocked = blockedBy(day, me, now);
        List<SlotChoice> choices = slots.stream()
                .map(s -> new SlotChoice(String.valueOf(s.id()), s.startsAt(), s.endsAt(), s.capacity() - s.booked()))
                .toList();
        return new MyFamilyDay(String.valueOf(day.id()),
                blocks.codesByIds(Set.of(day.buildingId())).get(day.buildingId()), day.title(), day.description(),
                day.area(), FamilyDays.status(day, slots, now), day.opensAt(), day.closesAt(),
                FamilyDays.firstStart(slots), FamilyDays.lastEnd(slots), day.maxGuests(),
                parameters.intValue("family_day.adult_age"), choices, blocked == null, blocked, mine);
    }

    private Map<Long, Integer> guestCounts(java.util.Collection<Registration> regs) {
        return days.visitors(regs.stream().map(Registration::id).toList()).stream()
                .collect(Collectors.groupingBy(Visitor::registrationId, Collectors.summingInt(v -> 1)));
    }
}
