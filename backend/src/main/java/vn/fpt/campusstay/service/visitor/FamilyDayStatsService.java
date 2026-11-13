package vn.fpt.campusstay.service.visitor;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.visitor.FamilyDays.Day;
import vn.fpt.campusstay.service.visitor.FamilyDays.Registration;
import vn.fpt.campusstay.service.visitor.FamilyDays.Slot;
import vn.fpt.campusstay.service.visitor.FamilyDays.Visitor;

/**
 * Family Day statistics for Staff (their Blocks), Managers and the Admin (contract A-70): how many registrations there
 * were, how many guests were registered and how many came, and how each time slot went. The overview lists Family Days
 * that are over (Completed, or published with every time slot ended); a Family Day's own figures can be read at any
 * time after it is published and are final once a Manager closes it.
 */
@Service
public class FamilyDayStatsService {

    /**
     * Guests counted on one Family Day or time slot. Registered = guests of live registrations; arrived = let in at the
     * desk; overstayed = still inside after their time slot ended, or checked out after it.
     */
    public record GuestFigures(long registered, long arrived, long checkedOut, long inside, long noShow,
            long notArrived, long cancelled, long overstayed) {
    }

    public record RegistrationFigures(long total, long approved, long cancelledByStudent, long cancelledByManager) {
    }

    /** The overdue procedure: guests the students were reminded about, confirmed safe, closed by a Manager without it. */
    public record OverdueFigures(long overstayed, long reminded, long studentsReminded, long safetyConfirmed,
            long closedWithoutConfirmation) {
    }

    /**
     * @param fillRate       booked places / capacity, in percent
     * @param attendanceRate arrived / registered guests, in percent
     */
    public record SlotStats(String id, Instant startsAt, Instant endsAt, int capacity, int booked, long registrations,
            GuestFigures guests, int fillRate, int attendanceRate, Long averageStayMinutes) {
    }

    public record Count(String label, long value) {
    }

    /** @param complete the Manager closed it: the figures no longer change */
    public record FamilyDayStats(String id, String block, String title, String area, String status, boolean complete,
            Instant startsAt, Instant endsAt, Instant closedAt, int capacity, int booked,
            RegistrationFigures registrations, GuestFigures guests, OverdueFigures overdue, int fillRate,
            int attendanceRate, Long averageStayMinutes, List<SlotStats> slots, List<Count> arrivalsByHour,
            List<Count> relationships, long adults, long minors) {
    }

    public record OverviewItem(String id, String block, String title, String area, String status, Instant startsAt,
            Instant endsAt, int capacity, long registrations, long guestsRegistered, long guestsArrived, long noShow,
            long overstayed, int attendanceRate) {
    }

    public record OverviewTotals(long familyDays, long registrations, long guestsRegistered, long guestsArrived,
            long noShow, long overstayed, int attendanceRate) {
    }

    public record Overview(OverviewTotals totals, List<OverviewItem> items) {
    }

    private final FamilyDays days;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blocks;
    private final Parameters parameters;
    private final Clock clock;

    public FamilyDayStatsService(FamilyDays days, CurrentUser currentUser, BlockScope blockScope, BlockDirectory blocks,
            Parameters parameters, Clock clock) {
        this.days = days;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blocks = blocks;
        this.parameters = parameters;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- the overview

    /** Family Days of the user's Blocks that are over, newest first, with their main figures and the totals. */
    @Transactional(readOnly = true)
    public Overview overview(String block) {
        currentUser.require(Permission.VIEW_FAMILY_DAY_STATS);
        Set<Long> scope = blockScope.resolve(block).ids();
        Instant now = Instant.now(clock);
        Map<Long, String> codes = blocks.codesByIds(scope);
        List<OverviewItem> items = new ArrayList<>();
        for (Day d : days.ofBuildings(scope)) {
            List<Slot> slots = days.slots(d.id());
            Instant end = FamilyDays.lastEnd(slots);
            boolean over = d.status().equals("COMPLETED")
                    || (d.status().equals("PUBLISHED") && end != null && !now.isBefore(end));
            if (!over) {
                continue;
            }
            Figures f = figures(d, slots, now);
            items.add(new OverviewItem(String.valueOf(d.id()), codes.get(d.buildingId()), d.title(), d.area(),
                    FamilyDays.status(d, slots, now), FamilyDays.firstStart(slots), end,
                    slots.stream().mapToInt(Slot::capacity).sum(), f.registrations().approved(),
                    f.guests().registered(), f.guests().arrived(), f.guests().noShow(), f.guests().overstayed(),
                    percent(f.guests().arrived(), f.guests().registered())));
        }
        items.sort(Comparator.comparing((OverviewItem i) -> i.startsAt() == null ? Instant.MIN : i.startsAt())
                .reversed());
        long registered = items.stream().mapToLong(OverviewItem::guestsRegistered).sum();
        long arrived = items.stream().mapToLong(OverviewItem::guestsArrived).sum();
        OverviewTotals totals = new OverviewTotals(items.size(),
                items.stream().mapToLong(OverviewItem::registrations).sum(), registered, arrived,
                items.stream().mapToLong(OverviewItem::noShow).sum(),
                items.stream().mapToLong(OverviewItem::overstayed).sum(), percent(arrived, registered));
        return new Overview(totals, items);
    }

    // ---------------------------------------------------------------- one Family Day

    @Transactional(readOnly = true)
    public FamilyDayStats stats(String id) {
        currentUser.require(Permission.VIEW_FAMILY_DAY_STATS);
        Day day = days.find(FamilyDays.id(id, "Family Day")).filter(d -> !d.status().equals("DRAFT"))
                .orElseThrow(FamilyDays::missing);
        blockScope.check(day.buildingId());
        if (day.status().equals("CANCELLED")) {
            throw ApiException.conflict("FAMILY_DAY_CANCELLED_NO_STATS",
                    "This Family Day was cancelled, so it has no statistics.");
        }
        Instant now = Instant.now(clock);
        List<Slot> slots = days.slots(day.id());
        Figures f = figures(day, slots, now);
        int capacity = slots.stream().mapToInt(Slot::capacity).sum();
        int booked = slots.stream().mapToInt(Slot::booked).sum();
        List<SlotStats> slotStats = slots.stream().map(s -> {
            List<Guest> mine = f.all().stream().filter(g -> g.slot().id() == s.id()).toList();
            GuestFigures gf = guestFigures(mine, now);
            long regs = f.live().stream().filter(r -> r.slotId() == s.id()).count();
            return new SlotStats(String.valueOf(s.id()), s.startsAt(), s.endsAt(), s.capacity(), s.booked(), regs, gf,
                    percent(s.booked(), s.capacity()), percent(gf.arrived(), gf.registered()), averageStay(mine));
        }).toList();

        // Arrivals per hour of the day (campus time), for the chart of when families came.
        Map<Integer, Long> hours = new TreeMap<>();
        for (Guest g : f.all()) {
            if (g.v().checkedInAt() != null) {
                hours.merge(ZonedDateTime.ofInstant(g.v().checkedInAt(), TimeConfig.CAMPUS_ZONE).getHour(), 1L,
                        Long::sum);
            }
        }
        List<Count> arrivals = hours.entrySet().stream()
                .map(e -> new Count("%02d:00".formatted(e.getKey()), e.getValue())).toList();
        List<Guest> registered = f.all().stream().filter(Guest::registered).toList();
        Map<String, Long> byRelationship = registered.stream()
                .collect(Collectors.groupingBy(g -> relationship(g.v().relationship()), TreeMap::new,
                        Collectors.counting()));
        List<Count> relationships = byRelationship.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed()).map(e -> new Count(e.getKey(), e.getValue()))
                .toList();
        int adultAge = parameters.intValue("family_day.adult_age");
        Instant first = FamilyDays.firstStart(slots);
        int year = first == null ? 0 : ZonedDateTime.ofInstant(first, TimeConfig.CAMPUS_ZONE).getYear();
        long adults = registered.stream().filter(g -> year - g.v().birthYear() >= adultAge).count();
        return new FamilyDayStats(String.valueOf(day.id()),
                blocks.codesByIds(Set.of(day.buildingId())).get(day.buildingId()), day.title(), day.area(),
                FamilyDays.status(day, slots, now), day.status().equals("COMPLETED"), first, FamilyDays.lastEnd(slots),
                day.closedAt(), capacity, booked, f.registrations(), f.guests(), f.overdue(), percent(booked, capacity),
                percent(f.guests().arrived(), f.guests().registered()), averageStay(f.all()), slotStats, arrivals,
                relationships, adults, registered.size() - adults);
    }

    // ---------------------------------------------------------------- counting

    /** A guest with their time slot and whether their registration is live. */
    private record Guest(Visitor v, Slot slot, boolean live) {

        boolean registered() {
            return live && !v.status().equals("CANCELLED");
        }
    }

    private record Figures(List<Guest> all, List<Registration> live, RegistrationFigures registrations,
            GuestFigures guests, OverdueFigures overdue) {
    }

    private Figures figures(Day day, List<Slot> slots, Instant now) {
        Map<Long, Slot> bySlot = slots.stream().collect(Collectors.toMap(Slot::id, Function.identity()));
        List<Registration> regs = days.registrations(day.id());
        Map<Long, Registration> byId = regs.stream().collect(Collectors.toMap(Registration::id, Function.identity()));
        List<Guest> all = days.visitors(byId.keySet()).stream().map(v -> {
            Registration r = byId.get(v.registrationId());
            return new Guest(v, bySlot.get(r.slotId()), r.status().equals("APPROVED"));
        }).toList();
        List<Registration> live = regs.stream().filter(r -> r.status().equals("APPROVED")).toList();
        long byStudent = regs.stream().filter(r -> r.status().equals("CANCELLED") && r.cancelledBy() != null
                && r.cancelledBy() == r.studentId()).count();
        long cancelled = regs.stream().filter(r -> r.status().equals("CANCELLED")).count();
        RegistrationFigures rf = new RegistrationFigures(regs.size(), live.size(), byStudent, cancelled - byStudent);
        GuestFigures gf = guestFigures(all, now);
        List<Guest> reminded = all.stream().filter(g -> g.v().remindedAt() != null).toList();
        long studentsReminded = reminded.stream().map(g -> byId.get(g.v().registrationId()).studentId()).distinct()
                .count();
        long confirmed = all.stream().filter(g -> g.v().safetyConfirmedAt() != null).count();
        // Checked out after the time slot, by a Manager, without the student's confirmation (contract A-70).
        long forced = all.stream().filter(g -> overstayed(g, now) && g.v().status().equals("CHECKED_OUT")
                && g.v().safetyConfirmedAt() == null && g.v().checkOutNote() != null).count();
        OverdueFigures of = new OverdueFigures(gf.overstayed(), reminded.size(), studentsReminded, confirmed, forced);
        return new Figures(all, live, rf, gf, of);
    }

    private static GuestFigures guestFigures(List<Guest> guests, Instant now) {
        long registered = 0, arrived = 0, out = 0, inside = 0, noShow = 0, notArrived = 0, cancelled = 0, over = 0;
        for (Guest g : guests) {
            if (!g.registered()) {
                cancelled++;
                continue;
            }
            registered++;
            if (g.v().checkedInAt() != null) {
                arrived++;
            }
            switch (FamilyDays.visitorStatus(g.v(), g.slot(), now)) {
                case "Checked in" -> inside++;
                case "Checked out" -> out++;
                case "No-show" -> noShow++;
                case "Not arrived" -> notArrived++;
                default -> {
                }
            }
            if (overstayed(g, now)) {
                over++;
            }
        }
        return new GuestFigures(registered, arrived, out, inside, noShow, notArrived, cancelled, over);
    }

    /** Inside after the end of the time slot: still there now, or checked out after it. */
    private static boolean overstayed(Guest g, Instant now) {
        Visitor v = g.v();
        if (v.checkedInAt() == null || g.slot() == null) {
            return false;
        }
        Instant left = v.checkedOutAt() != null ? v.checkedOutAt() : v.status().equals("CHECKED_IN") ? now : null;
        return left != null && left.isAfter(g.slot().endsAt());
    }

    /** Minutes between check-in and check-out of guests who did both, on average; null when nobody did. */
    private static Long averageStay(List<Guest> guests) {
        List<Long> stays = guests.stream().filter(g -> g.v().checkedInAt() != null && g.v().checkedOutAt() != null)
                .map(g -> Duration.between(g.v().checkedInAt(), g.v().checkedOutAt()).toMinutes()).toList();
        return stays.isEmpty() ? null : Math.round(stays.stream().mapToLong(Long::longValue).average().orElse(0));
    }

    private static int percent(long part, long whole) {
        return whole <= 0 ? 0 : (int) Math.round(100.0 * part / whole);
    }

    /** Relationships are typed by students: "bố", "Bố " and "BỐ" count as one. */
    private static String relationship(String value) {
        String v = value == null ? "" : value.trim();
        if (v.isEmpty()) {
            return "—";
        }
        String lower = v.toLowerCase(Locale.ROOT);
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }
}
