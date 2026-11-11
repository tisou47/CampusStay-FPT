package vn.fpt.campusstay.service.visitor;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.event.FamilyDayCancelled;
import vn.fpt.campusstay.event.FamilyDayPublished;
import vn.fpt.campusstay.event.FamilyDayRegistrationCancelled;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.visitor.FamilyDays.Day;
import vn.fpt.campusstay.service.visitor.FamilyDays.Registration;
import vn.fpt.campusstay.service.visitor.FamilyDays.Slot;
import vn.fpt.campusstay.service.visitor.FamilyDays.Visitor;

/**
 * Family Days for Managers and Staff (ADR-29, contract A-69): a Manager creates a Draft for one Block, publishes it
 * (the Block's residents are told), may cancel it while no guest has come in, and closes it once its time slots are
 * over and nobody is inside (guests who never came become No-shows). Staff of the Block read it and its registrations.
 */
@Service
public class FamilyDayService {

    public record SlotInput(Instant startsAt, Instant endsAt, Integer capacity) {
    }

    public record SaveCommand(String block, String title, String description, String area, Instant registrationOpensAt,
            Instant registrationClosesAt, Integer maxGuests, List<SlotInput> slots) {
    }

    public record SlotView(String id, Instant startsAt, Instant endsAt, int capacity, int booked, int remaining,
            long inside, long checkedOut, long noShow) {
    }

    public record Counts(long registrations, long guests, long notArrived, long inside, long overdue, long checkedOut,
            long noShow, long cancelled) {
    }

    public record Actions(boolean edit, boolean publish, boolean cancel, boolean close) {
    }

    public record FamilyDayItem(String id, String block, String title, String area, String status,
            Instant registrationOpensAt, Instant registrationClosesAt, Instant startsAt, Instant endsAt, int maxGuests,
            int capacity, int booked, long inside) {
    }

    public record FamilyDayPage(List<FamilyDayItem> items, long total, List<String> statuses) {
    }

    public record FamilyDayDetail(String id, String block, String title, String description, String area,
            String status, Instant registrationOpensAt, Instant registrationClosesAt, Instant startsAt, Instant endsAt,
            int maxGuests, List<SlotView> slots, Counts counts, String createdBy, Instant createdAt,
            Instant publishedAt, Instant cancelledAt, String cancelReason, Instant closedAt, String closedBy,
            String closeNote, Actions actions) {
    }

    public record GuestView(String id, String fullName, String relationship, int birthYear, String status,
            boolean overdue, Instant checkedInAt, Instant checkedOutAt) {
    }

    public record RegistrationItem(String id, String studentName, String studentCode, String room, String slotId,
            Instant slotStartsAt, Instant slotEndsAt, String status, Instant createdAt, Instant cancelledAt,
            String cancelledBy, boolean cancelledByStudent, String cancelReason, List<GuestView> guests) {
    }

    public record RegistrationPage(List<RegistrationItem> items, long total, long guests) {
    }

    static final List<String> STATUSES = List.of("Draft", "Published", "Registration open", "Registration closed",
            "In progress", "Completed", "Cancelled");
    private static final int MAX_SLOTS = 10;

    private final JdbcClient jdbc;
    private final FamilyDays days;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blocks;
    private final UserDirectory users;
    private final Residences residences;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public FamilyDayService(JdbcClient jdbc, FamilyDays days, CurrentUser currentUser, BlockScope blockScope,
            BlockDirectory blocks, UserDirectory users, Residences residences, ApplicationEventPublisher events,
            AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.days = days;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blocks = blocks;
        this.users = users;
        this.residences = residences;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- reads

    /** Family Days of the user's Blocks, newest first. @param status a label of {@code statuses} */
    @Transactional(readOnly = true)
    public FamilyDayPage list(String block, String status, PageQuery page) {
        requireViewer();
        Set<Long> scope = blockScope.resolve(block).ids();
        String wanted = status == null || status.isBlank() ? null : STATUSES.stream()
                .filter(s -> s.equalsIgnoreCase(status.trim())).findFirst()
                .orElseThrow(() -> FieldErrors.single("status", "Choose one of: " + String.join(", ", STATUSES) + "."));
        Instant now = Instant.now(clock);
        List<Day> all = days.ofBuildings(scope);
        Map<Long, List<Slot>> slots = days.slots(all.stream().map(Day::id).toList()).stream()
                .collect(Collectors.groupingBy(Slot::dayId));
        Map<Long, String> codes = blocks.codesByIds(scope);
        List<FamilyDayItem> items = new ArrayList<>();
        for (Day d : all) {
            List<Slot> s = slots.getOrDefault(d.id(), List.of());
            String label = FamilyDays.status(d, s, now);
            if (wanted != null && !wanted.equals(label)) {
                continue;
            }
            items.add(new FamilyDayItem(String.valueOf(d.id()), codes.get(d.buildingId()), d.title(), d.area(), label,
                    d.opensAt(), d.closesAt(), FamilyDays.firstStart(s), FamilyDays.lastEnd(s), d.maxGuests(),
                    s.stream().mapToInt(Slot::capacity).sum(), s.stream().mapToInt(Slot::booked).sum(),
                    d.status().equals("PUBLISHED") ? days.count(d.id(), "CHECKED_IN") : 0));
        }
        items.sort(Comparator.comparing((FamilyDayItem i) -> i.startsAt() == null ? Instant.MAX : i.startsAt())
                .reversed());
        return new FamilyDayPage(items.stream().skip(page.offset()).limit(page.limit()).toList(), items.size(),
                STATUSES);
    }

    @Transactional(readOnly = true)
    public FamilyDayDetail detail(String id) {
        requireViewer();
        Day day = days.get(FamilyDays.id(id, "Family Day"));
        blockScope.check(day.buildingId());
        return detail(day);
    }

    /** Registrations with their guests (Managers and the Block's Staff). @param q student or guest name, or student code */
    @Transactional(readOnly = true)
    public RegistrationPage registrations(String id, String slotId, String q, PageQuery page) {
        requireViewer();
        Day day = days.get(FamilyDays.id(id, "Family Day"));
        blockScope.check(day.buildingId());
        Instant now = Instant.now(clock);
        Map<Long, Slot> slots = days.slots(day.id()).stream().collect(Collectors.toMap(Slot::id, Function.identity()));
        Long slotFilter = slotId == null || slotId.isBlank() ? null : FamilyDays.id(slotId, "time slot");
        List<Registration> regs = days.registrations(day.id()).stream()
                .filter(r -> slotFilter == null || r.slotId() == slotFilter).toList();
        Map<Long, List<Visitor>> guests = days.visitors(regs.stream().map(Registration::id).toList()).stream()
                .collect(Collectors.groupingBy(Visitor::registrationId));
        Set<Long> studentIds = regs.stream().map(Registration::studentId).collect(Collectors.toSet());
        Map<Long, UserDirectory.Student> students = users.students(studentIds);
        Map<Long, Residences.Residence> homes = residences.current(studentIds);
        // Who cancelled: the student themself, or a Manager (one registration, or the whole Family Day).
        Map<Long, String> cancellers = users.displayNames(regs.stream().map(Registration::cancelledBy)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet()));
        String needle = q == null || q.isBlank() ? null : q.trim().toLowerCase(Locale.ROOT);
        List<RegistrationItem> items = new ArrayList<>();
        for (Registration r : regs) {
            UserDirectory.Student s = students.get(r.studentId());
            List<Visitor> vs = guests.getOrDefault(r.id(), List.of());
            if (needle != null && !matches(needle, s, vs)) {
                continue;
            }
            Slot slot = slots.get(r.slotId());
            items.add(new RegistrationItem(String.valueOf(r.id()), s == null ? null : s.name(),
                    s == null ? null : s.studentCode(),
                    homes.containsKey(r.studentId()) ? homes.get(r.studentId()).room() : null,
                    String.valueOf(r.slotId()), slot.startsAt(), slot.endsAt(),
                    FamilyDays.REGISTRATION_STATUSES.get(r.status()), r.createdAt(), r.cancelledAt(),
                    r.cancelledBy() == null ? null : cancellers.get(r.cancelledBy()),
                    r.cancelledBy() != null && r.cancelledBy() == r.studentId(), r.cancelReason(),
                    vs.stream().map(v -> guest(v, slot, now)).toList()));
        }
        // Live registrations first, then by time slot and name.
        items.sort(Comparator.comparing((RegistrationItem i) -> !i.status().equals("Approved"))
                .thenComparing(RegistrationItem::slotStartsAt)
                .thenComparing(i -> i.studentName() == null ? "" : i.studentName()));
        long guestCount = items.stream().filter(i -> i.status().equals("Approved")).mapToLong(i -> i.guests().size())
                .sum();
        return new RegistrationPage(items.stream().skip(page.offset()).limit(page.limit()).toList(), items.size(),
                guestCount);
    }

    private static boolean matches(String needle, UserDirectory.Student s, List<Visitor> guests) {
        if (s != null && ((s.name() != null && s.name().toLowerCase(Locale.ROOT).contains(needle))
                || (s.studentCode() != null && s.studentCode().toLowerCase(Locale.ROOT).contains(needle)))) {
            return true;
        }
        return guests.stream().anyMatch(v -> v.fullName().toLowerCase(Locale.ROOT).contains(needle));
    }

    static GuestView guest(Visitor v, Slot slot, Instant now) {
        return new GuestView(String.valueOf(v.id()), v.fullName(), v.relationship(), v.birthYear(),
                FamilyDays.visitorStatus(v, slot, now), FamilyDays.overdue(v, slot, now), v.checkedInAt(),
                v.checkedOutAt());
    }

    // ---------------------------------------------------------------- create and edit a Draft

    @Transactional
    public FamilyDayDetail create(SaveCommand cmd) {
        AuthenticatedUser user = currentUser.require(Permission.MANAGE_FAMILY_DAYS);
        Valid v = validate(cmd);
        long id = jdbc.sql("""
                INSERT INTO vis_family_day (building_id, title, description, area, registration_opens_at,
                                            registration_closes_at, max_guests, created_by, created_at)
                VALUES (:b, :title, :description, :area, :opens, :closes, :max, :by, :now)
                RETURNING id
                """).param("b", v.buildingId()).param("title", v.title()).param("description", v.description())
                .param("area", v.area()).param("opens", ts(cmd.registrationOpensAt()))
                .param("closes", ts(cmd.registrationClosesAt())).param("max", cmd.maxGuests())
                .param("by", user.userId()).param("now", ts(Instant.now(clock))).query(Long.class).single();
        insertSlots(id, cmd.slots());
        audit.record("FAMILY_DAY_CREATED", AuditLog.Tone.INFO, "FamilyDay", id, v.title(),
                Map.of("block", v.blockCode(), "slots", cmd.slots().size()));
        return detail(days.get(id));
    }

    /** Only a Draft changes; its time slots are replaced. */
    @Transactional
    public FamilyDayDetail update(String id, SaveCommand cmd) {
        currentUser.require(Permission.MANAGE_FAMILY_DAYS);
        Day day = days.lock(FamilyDays.id(id, "Family Day"));
        blockScope.check(day.buildingId());
        if (!day.status().equals("DRAFT")) {
            throw ApiException.conflict("FAMILY_DAY_NOT_DRAFT",
                    "Only a Draft can be edited. Cancel this Family Day and create a new one instead.");
        }
        Valid v = validate(cmd);
        jdbc.sql("""
                UPDATE vis_family_day SET building_id = :b, title = :title, description = :description, area = :area,
                       registration_opens_at = :opens, registration_closes_at = :closes, max_guests = :max,
                       version = version + 1
                WHERE id = :id
                """).param("b", v.buildingId()).param("title", v.title()).param("description", v.description())
                .param("area", v.area()).param("opens", ts(cmd.registrationOpensAt()))
                .param("closes", ts(cmd.registrationClosesAt())).param("max", cmd.maxGuests()).param("id", day.id())
                .update();
        jdbc.sql("DELETE FROM vis_time_slot WHERE family_day_id = :id").param("id", day.id()).update();
        insertSlots(day.id(), cmd.slots());
        audit.record("FAMILY_DAY_EDITED", AuditLog.Tone.INFO, "FamilyDay", day.id(), v.title(), Map.of());
        return detail(days.get(day.id()));
    }

    private record Valid(long buildingId, String blockCode, String title, String description, String area) {
    }

    private Valid validate(SaveCommand cmd) {
        FieldErrors errors = new FieldErrors();
        String title = trim(cmd.title());
        String area = trim(cmd.area());
        String description = trim(cmd.description());
        errors.check(title != null && title.length() >= 3 && title.length() <= 120, "title",
                "Write a title of 3 to 120 characters.");
        errors.check(area != null && area.length() >= 2 && area.length() <= 200, "area",
                "Write where families are received (2 to 200 characters).");
        errors.check(description == null || description.length() <= 2000, "description",
                "Keep the description under 2,000 characters.");
        errors.check(cmd.maxGuests() != null && cmd.maxGuests() >= 1 && cmd.maxGuests() <= 10, "maxGuests",
                "Allow from 1 to 10 guests per student.");
        errors.check(cmd.registrationOpensAt() != null, "registrationOpensAt", "Choose when registration opens.");
        errors.check(cmd.registrationClosesAt() != null, "registrationClosesAt", "Choose when registration closes.");
        if (cmd.registrationOpensAt() != null && cmd.registrationClosesAt() != null) {
            errors.check(cmd.registrationClosesAt().isAfter(cmd.registrationOpensAt()), "registrationClosesAt",
                    "Registration must close after it opens.");
        }
        List<SlotInput> slots = cmd.slots() == null ? List.of() : cmd.slots();
        errors.check(!slots.isEmpty() && slots.size() <= MAX_SLOTS, "slots",
                "Add from 1 to " + MAX_SLOTS + " time slots.");
        for (int i = 0; i < slots.size(); i++) {
            SlotInput s = slots.get(i);
            String field = "slots[" + i + "]";
            if (s == null || s.startsAt() == null || s.endsAt() == null) {
                errors.add(field + ".startsAt", "Choose when the time slot starts and ends.");
                continue;
            }
            errors.check(s.endsAt().isAfter(s.startsAt()), field + ".endsAt", "A time slot must end after it starts.");
            errors.check(s.capacity() != null && s.capacity() >= 1 && s.capacity() <= 5000, field + ".capacity",
                    "Allow from 1 to 5000 guests in a time slot.");
            if (cmd.registrationClosesAt() != null) {
                errors.check(!s.startsAt().isBefore(cmd.registrationClosesAt()), field + ".startsAt",
                        "Registration must close before the first time slot starts.");
            }
            for (int j = 0; j < i; j++) {
                SlotInput o = slots.get(j);
                if (o != null && o.startsAt() != null && o.endsAt() != null && s.startsAt().isBefore(o.endsAt())
                        && o.startsAt().isBefore(s.endsAt())) {
                    errors.add(field + ".startsAt", "Time slots must not overlap.");
                    break;
                }
            }
        }
        String blockCode = cmd.block() == null ? null : cmd.block().trim();
        errors.check(blockCode != null && !blockCode.isEmpty(), "block", "Choose the Block that receives the families.");
        errors.throwIfAny();
        long buildingId = blockScope.resolve(blockCode).ids().iterator().next();
        return new Valid(buildingId, blockCode, title, description, area);
    }

    private void insertSlots(long dayId, List<SlotInput> slots) {
        for (SlotInput s : slots.stream().sorted(Comparator.comparing(SlotInput::startsAt)).toList()) {
            jdbc.sql("""
                    INSERT INTO vis_time_slot (family_day_id, starts_at, ends_at, capacity)
                    VALUES (:d, :starts, :ends, :capacity)
                    """).param("d", dayId).param("starts", ts(s.startsAt())).param("ends", ts(s.endsAt()))
                    .param("capacity", s.capacity()).update();
        }
    }

    // ---------------------------------------------------------------- publish, cancel, close

    /** The Draft becomes visible to the Block's residents, who are told. Its first time slot must be in the future. */
    @Transactional
    public FamilyDayDetail publish(String id) {
        currentUser.require(Permission.MANAGE_FAMILY_DAYS);
        Day day = days.lock(FamilyDays.id(id, "Family Day"));
        blockScope.check(day.buildingId());
        if (!day.status().equals("DRAFT")) {
            throw ApiException.conflict("FAMILY_DAY_NOT_DRAFT", "This Family Day is already published.");
        }
        Instant now = Instant.now(clock);
        List<Slot> slots = days.slots(day.id());
        if (slots.isEmpty() || !FamilyDays.firstStart(slots).isAfter(now) || !day.closesAt().isAfter(now)) {
            throw ApiException.conflict("FAMILY_DAY_IN_THE_PAST",
                    "Registration must close and the first time slot must start in the future. Edit the dates first.");
        }
        jdbc.sql("UPDATE vis_family_day SET status = 'PUBLISHED', published_at = :now, version = version + 1 WHERE id = :id")
                .param("now", ts(now)).param("id", day.id()).update();
        String block = blocks.codesByIds(Set.of(day.buildingId())).get(day.buildingId());
        List<Long> students = List.copyOf(residences.residentsOf(Set.of(day.buildingId())));
        events.publishEvent(new FamilyDayPublished(day.id(), day.title(), block, day.area(),
                FamilyDays.firstStart(slots), day.closesAt(), students));
        audit.record("FAMILY_DAY_PUBLISHED", AuditLog.Tone.SUCCESS, "FamilyDay", day.id(), day.title(),
                Map.of("residentsTold", students.size()));
        return detail(days.get(day.id()));
    }

    /**
     * Cancels a Draft or a published Family Day no guest has come into yet: every registration is cancelled, every pass
     * stops working and the students who had registered are told.
     */
    @Transactional
    public FamilyDayDetail cancel(String id, String reason) {
        AuthenticatedUser user = currentUser.require(Permission.MANAGE_FAMILY_DAYS);
        String why = trim(reason);
        if (why == null) {
            throw FieldErrors.single("reason", "Write why the Family Day is cancelled.");
        }
        if (why.length() > 500) {
            throw FieldErrors.single("reason", "Keep the reason under 500 characters.");
        }
        Day day = days.lock(FamilyDays.id(id, "Family Day"));
        blockScope.check(day.buildingId());
        if (!day.status().equals("DRAFT") && !day.status().equals("PUBLISHED")) {
            throw ApiException.conflict("FAMILY_DAY_ENDED", "This Family Day is already cancelled or completed.");
        }
        if (days.count(day.id(), "CHECKED_IN") + days.count(day.id(), "CHECKED_OUT") > 0) {
            throw ApiException.conflict("FAMILY_DAY_STARTED",
                    "Guests have already come in. Close the Family Day instead of cancelling it.");
        }
        Instant now = Instant.now(clock);
        List<Long> students = jdbc.sql("""
                UPDATE vis_registration SET status = 'CANCELLED', cancelled_at = :now, cancelled_by = :by,
                       cancel_reason = :why
                WHERE family_day_id = :d AND status = 'APPROVED'
                RETURNING student_id
                """).param("now", ts(now)).param("by", user.userId()).param("why", why).param("d", day.id())
                .query(Long.class).list();
        jdbc.sql("""
                UPDATE vis_visitor SET status = 'CANCELLED'
                WHERE status = 'NOT_ARRIVED'
                  AND registration_id IN (SELECT id FROM vis_registration WHERE family_day_id = :d)
                """).param("d", day.id()).update();
        jdbc.sql("UPDATE vis_time_slot SET booked = 0 WHERE family_day_id = :d").param("d", day.id()).update();
        jdbc.sql("""
                UPDATE vis_family_day SET status = 'CANCELLED', cancelled_at = :now, cancel_reason = :why,
                       version = version + 1
                WHERE id = :id
                """).param("now", ts(now)).param("why", why).param("id", day.id()).update();
        if (!students.isEmpty()) {
            events.publishEvent(new FamilyDayCancelled(day.id(), day.title(), FamilyDays.firstStart(days.slots(day.id())),
                    why, students));
        }
        audit.record("FAMILY_DAY_CANCELLED", AuditLog.Tone.WARNING, "FamilyDay", day.id(), day.title(),
                Map.of("reason", why, "registrationsCancelled", students.size()));
        return detail(days.get(day.id()));
    }

    /**
     * Closes a published Family Day whose time slots are over and inside which nobody is left (Staff check the last
     * guests out first): guests who never came are recorded as No-shows and the counts are final.
     */
    @Transactional
    public FamilyDayDetail close(String id, String note) {
        AuthenticatedUser user = currentUser.require(Permission.MANAGE_FAMILY_DAYS);
        String text = trim(note);
        if (text != null && text.length() > 500) {
            throw FieldErrors.single("note", "Keep the note under 500 characters.");
        }
        Day day = days.lock(FamilyDays.id(id, "Family Day"));
        blockScope.check(day.buildingId());
        if (!day.status().equals("PUBLISHED")) {
            throw ApiException.conflict("FAMILY_DAY_NOT_PUBLISHED", "Only a published Family Day can be closed.");
        }
        Instant now = Instant.now(clock);
        Instant end = FamilyDays.lastEnd(days.slots(day.id()));
        if (end != null && now.isBefore(end)) {
            throw ApiException.conflict("FAMILY_DAY_NOT_OVER",
                    "The last time slot ends at " + FamilyDays.TIME.format(end) + ". Close the Family Day after it.");
        }
        long inside = days.count(day.id(), "CHECKED_IN");
        if (inside > 0) {
            throw new ApiException(org.springframework.http.HttpStatus.CONFLICT, "FAMILY_DAY_GUESTS_INSIDE",
                    inside + " guests are still checked in. Check them out at the desk first.",
                    Map.of("inside", inside));
        }
        int noShows = jdbc.sql("""
                UPDATE vis_visitor SET status = 'NO_SHOW'
                WHERE status = 'NOT_ARRIVED'
                  AND registration_id IN (SELECT id FROM vis_registration WHERE family_day_id = :d AND status = 'APPROVED')
                """).param("d", day.id()).update();
        jdbc.sql("""
                UPDATE vis_family_day SET status = 'COMPLETED', closed_at = :now, closed_by = :by, close_note = :note,
                       version = version + 1
                WHERE id = :id
                """).param("now", ts(now)).param("by", user.userId()).param("note", text).param("id", day.id())
                .update();
        Map<String, Object> change = new LinkedHashMap<>();
        change.put("checkedOut", days.count(day.id(), "CHECKED_OUT"));
        change.put("noShow", noShows);
        if (text != null) {
            change.put("note", text);
        }
        audit.record("FAMILY_DAY_CLOSED", AuditLog.Tone.SUCCESS, "FamilyDay", day.id(), day.title(), change);
        return detail(days.get(day.id()));
    }

    /** A Manager cancels one registration no guest of which has come in; its passes stop working and its places free up. */
    @Transactional
    public void cancelRegistration(String id, String reason) {
        AuthenticatedUser user = currentUser.require(Permission.MANAGE_FAMILY_DAYS);
        String why = trim(reason);
        if (why == null) {
            throw FieldErrors.single("reason", "Write why the registration is cancelled.");
        }
        if (why.length() > 500) {
            throw FieldErrors.single("reason", "Keep the reason under 500 characters.");
        }
        Registration r = days.registration(FamilyDays.id(id, "registration"))
                .orElseThrow(() -> ApiException.notFound("This registration does not exist."));
        Day day = days.lock(r.dayId());
        blockScope.check(day.buildingId());
        Registrations.cancel(jdbc, days, day, r, user.userId(), why, Instant.now(clock));
        events.publishEvent(new FamilyDayRegistrationCancelled(day.id(), day.title(), r.studentId(), why));
        audit.record("FAMILY_DAY_REGISTRATION_CANCELLED", AuditLog.Tone.WARNING, "FamilyDayRegistration", r.id(),
                day.title(), Map.of("reason", why));
    }

    // ---------------------------------------------------------------- helpers

    private void requireViewer() {
        AuthenticatedUser user = currentUser.get();
        if (!Permission.FAMILY_DAY_DESK.allows(user.role()) && !Permission.MANAGE_FAMILY_DAYS.allows(user.role())) {
            throw ApiException.forbidden("FORBIDDEN", "You do not have permission to do this.");
        }
    }

    private FamilyDayDetail detail(Day day) {
        Instant now = Instant.now(clock);
        List<Slot> slots = days.slots(day.id());
        Map<Long, Slot> bySlot = slots.stream().collect(Collectors.toMap(Slot::id, Function.identity()));
        List<Registration> regs = days.registrations(day.id());
        Map<Long, Registration> byId = regs.stream().collect(Collectors.toMap(Registration::id, Function.identity()));
        List<Visitor> visitors = days.visitors(byId.keySet());
        Map<Long, Map<String, Long>> perSlot = new HashMap<>();
        long notArrived = 0, inside = 0, overdue = 0, out = 0, noShow = 0, cancelled = 0;
        for (Visitor v : visitors) {
            Registration r = byId.get(v.registrationId());
            Slot slot = bySlot.get(r.slotId());
            String label = FamilyDays.visitorStatus(v, slot, now);
            perSlot.computeIfAbsent(r.slotId(), k -> new HashMap<>()).merge(label, 1L, Long::sum);
            switch (label) {
                case "Not arrived" -> notArrived++;
                case "Checked in" -> inside++;
                case "Checked out" -> out++;
                case "No-show" -> noShow++;
                default -> cancelled++;
            }
            if (FamilyDays.overdue(v, slot, now)) {
                overdue++;
            }
        }
        List<SlotView> slotViews = slots.stream().map(s -> {
            Map<String, Long> c = perSlot.getOrDefault(s.id(), Map.of());
            return new SlotView(String.valueOf(s.id()), s.startsAt(), s.endsAt(), s.capacity(), s.booked(),
                    s.capacity() - s.booked(), c.getOrDefault("Checked in", 0L), c.getOrDefault("Checked out", 0L),
                    c.getOrDefault("No-show", 0L));
        }).toList();
        long live = regs.stream().filter(r -> r.status().equals("APPROVED")).count();
        Counts counts = new Counts(live, notArrived + inside + out + noShow, notArrived, inside, overdue, out, noShow,
                cancelled);
        Set<Long> people = new java.util.HashSet<>();
        people.add(day.createdBy());
        if (day.closedBy() != null) {
            people.add(day.closedBy());
        }
        Map<Long, String> names = users.displayNames(people);
        String status = FamilyDays.status(day, slots, now);
        boolean manager = Permission.MANAGE_FAMILY_DAYS.allows(currentUser.get().role());
        Instant end = FamilyDays.lastEnd(slots);
        Actions actions = new Actions(manager && day.status().equals("DRAFT"), manager && day.status().equals("DRAFT"),
                manager && (day.status().equals("DRAFT") || day.status().equals("PUBLISHED")) && inside + out == 0,
                manager && day.status().equals("PUBLISHED") && end != null && !now.isBefore(end) && inside == 0);
        return new FamilyDayDetail(String.valueOf(day.id()),
                blocks.codesByIds(Set.of(day.buildingId())).get(day.buildingId()), day.title(), day.description(),
                day.area(), status, day.opensAt(), day.closesAt(), FamilyDays.firstStart(slots), end, day.maxGuests(),
                slotViews, counts, names.get(day.createdBy()), day.createdAt(), day.publishedAt(), day.cancelledAt(),
                day.cancelReason(), day.closedAt(), day.closedBy() == null ? null : names.get(day.closedBy()),
                day.closeNote(), actions);
    }

    static String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    static Timestamp ts(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }
}
