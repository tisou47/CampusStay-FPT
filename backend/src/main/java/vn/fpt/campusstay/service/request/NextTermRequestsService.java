package vn.fpt.campusstay.service.request;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.event.NextTermAllocationCancelled;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.assignment.Stays;
import vn.fpt.campusstay.service.setting.Lookups;

/**
 * Every next-Term request of a requests window still waiting for a decision, in one list (spec §5.1 M4: Managers
 * decide in bulk), and the bulk decision itself. Each decision runs in its own transaction through the request's
 * service, so one that fails (a Bed taken, a consent missing) does not undo the others. Also closes the open requests
 * of a student whose next-Term Allocation was cancelled.
 */
@Service
public class NextTermRequestsService {

    /**
     * One open request.
     *
     * @param kind    {@code room-change}, {@code swap}, {@code room-class-change} or {@code extension}
     * @param student who asked (the Room for a Room Class change)
     */
    public record OpenItem(String kind, String id, String student, String studentCode, String summary, String status,
            Instant submittedAt, Instant dueAt, boolean crossBlock) {
    }

    public record OpenPage(List<OpenItem> items, long total, RoomChangeService.Window window) {
    }

    public record Target(String kind, String id) {
    }

    public record Failure(String kind, String id, String message) {
    }

    public record BulkResult(int decided, List<Failure> failed) {
    }

    private static final int MAX_BULK = 200;

    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final NextTermContext context;
    private final RoomChangeService roomChanges;
    private final SwapService swaps;
    private final RoomClassChangeService classChanges;
    private final StayRequestService stayRequests;
    private final Lookups lookups;
    private final Clock clock;

    public NextTermRequestsService(CurrentUser currentUser, BlockScope blockScope, NextTermContext context,
            RoomChangeService roomChanges, SwapService swaps, RoomClassChangeService classChanges,
            StayRequestService stayRequests, Lookups lookups, Clock clock) {
        this.lookups = lookups;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.context = context;
        this.roomChanges = roomChanges;
        this.swaps = swaps;
        this.classChanges = classChanges;
        this.stayRequests = stayRequests;
        this.clock = clock;
    }

    /** @param kind one of the kinds, blank = all; {@code termId} null = the latest open requests window */
    public OpenPage open(Long termId, String block, String kind) {
        currentUser.require(Permission.DECIDE_ROOM_CHANGES);
        Set<Long> scope = blockScope.resolve(block).ids();
        long term = termId != null ? termId : context.current().map(Stays.Window::termId)
                .orElseThrow(() -> ApiException.notFound("No requests window is open."));
        Stays.Window w = context.window(term).orElseThrow(() -> ApiException.notFound(
                "This Term has no requests window: it has no renewal milestones."));
        String k = kind == null || kind.isBlank() ? null : kind.trim().toLowerCase(Locale.ROOT);
        if (k != null && !List.of("room-change", "swap", "room-class-change", "extension").contains(k)) {
            throw FieldErrors.single("kind", "Choose room-change, swap, room-class-change or extension.");
        }
        List<OpenItem> items = new ArrayList<>();
        PageQuery all = PageQuery.of(1, 100);
        if (k == null || k.equals("room-change")) {
            for (int p = 1;; p++) {
                RoomChangeService.QueuePage page = roomChanges.queue(term, block, "Pending", null, PageQuery.of(p, 100));
                page.items().forEach(i -> items.add(new OpenItem("room-change", i.id(), i.studentName(),
                        i.studentCode(), (i.from() == null ? "" : i.from().room() + " · " + i.from().bed() + " → ")
                                + i.to().roomTypeName() + " · " + i.to().roomClassName(),
                        i.status(), i.submittedAt(), i.dueAt(), false)));
                if (page.items().size() < 100) {
                    break;
                }
            }
        }
        if (k == null || k.equals("swap")) {
            for (String status : List.of("Waiting for Staff", "To Manager")) {
                swaps.queue(term, block, null, status, all).items().forEach(i -> items.add(new OpenItem("swap", i.id(),
                        i.a() == null ? null : i.a().name(), i.a() == null ? null : i.a().studentCode(),
                        (i.a() == null ? "?" : i.a().room() + " · " + i.a().bed()) + " ⇄ "
                                + (i.b() == null ? "?" : i.b().room() + " · " + i.b().bed()
                                        + (i.b().name() == null ? "" : " (" + i.b().name() + ")")),
                        i.status(), i.agreedAt(), i.dueAt(), i.crossBlock())));
            }
        }
        if (k == null || k.equals("room-class-change")) {
            classChanges.open(term, scope).forEach(i -> items.add(new OpenItem("room-class-change", i.id(),
                    "Room " + i.room(), null, i.fromClass() + " → " + i.toClass() + " · " + i.agreed() + "/" + i.asked()
                            + " agreed",
                    i.status(), i.submittedAt(), i.dueAt(), false)));
        }
        if (k == null || k.equals("extension")) {
            stayRequests.open(term, scope).forEach(i -> items.add(new OpenItem("extension", i.id(), i.studentName(),
                    i.studentCode(), "+" + i.terms() + " · " + i.room(), i.status(), i.submittedAt(), i.dueAt(),
                    false)));
        }
        items.sort(Comparator.comparing(OpenItem::submittedAt, Comparator.nullsLast(Comparator.naturalOrder())));
        return new OpenPage(items, items.size(), RoomChangeService.window(w));
    }

    /**
     * Decides many requests at once: {@code Approved} (a room change gets the first matching free Bed the decider
     * may give) or {@code Rejected} with a reason (for a room change, a label of its reject reasons).
     */
    public BulkResult decide(List<Target> targets, String decision, String reason) {
        currentUser.require(Permission.DECIDE_ROOM_CHANGES);
        if (targets == null || targets.isEmpty()) {
            throw FieldErrors.single("items", "Choose at least one request.");
        }
        if (targets.size() > MAX_BULK) {
            throw FieldErrors.single("items", "Decide at most " + MAX_BULK + " requests at once.");
        }
        String d = decision == null ? "" : decision.trim();
        boolean approve = d.equalsIgnoreCase("approved");
        if (!approve && !d.equalsIgnoreCase("rejected")) {
            throw FieldErrors.single("decision", "Choose Approved or Rejected.");
        }
        String why = reason == null || reason.isBlank() ? null : reason.trim();
        if (!approve && why == null) {
            throw FieldErrors.single("reason", "Write why the requests are rejected. The students see it.");
        }
        int decided = 0;
        List<Failure> failed = new ArrayList<>();
        for (Target t : targets) {
            String kind = t.kind() == null ? "" : t.kind().trim().toLowerCase(Locale.ROOT);
            try {
                switch (kind) {
                    case "room-change" -> {
                        if (approve) {
                            String bed = roomChanges.matchingBeds(t.id()).items().stream().findFirst()
                                    .map(RoomChangeService.MatchingBed::bedId)
                                    .orElseThrow(() -> ApiException.conflict("BED_NOT_AVAILABLE",
                                            "No matching Bed is free for this request."));
                            roomChanges.decide(t.id(), "Approved", bed, null, null);
                        } else {
                            // A room change is rejected with one of its listed reasons; free text becomes the note.
                            String listed = lookups.find("ROOM_CHANGE_REJECT_REASON", why).map(Lookups.Lookup::label)
                                    .orElse(null);
                            roomChanges.decide(t.id(), "Rejected", null,
                                    listed != null ? listed : "INSUFFICIENT_REASON", listed != null ? null : why);
                        }
                    }
                    case "swap" -> swaps.decide(t.id(), d, why);
                    case "room-class-change" -> classChanges.decide(t.id(), d, why);
                    case "extension" -> stayRequests.decide(t.id(), d, why);
                    default -> throw FieldErrors.single("kind", "Choose room-change, swap, room-class-change or extension.");
                }
                decided++;
            } catch (ApiException e) {
                failed.add(new Failure(t.kind(), t.id(), e.getMessage()));
            }
        }
        return new BulkResult(decided, failed);
    }

    /**
     * A next-Term Allocation was cancelled (Assignment's transaction: end of stay, not extended, fee not paid, not
     * enrolled, terminated): every open request made from it closes, and its student no longer has to consent.
     */
    @EventListener
    void on(NextTermAllocationCancelled e) {
        Instant now = Instant.now(clock);
        roomChanges.allocationCancelled(e.allocationId(), now);
        swaps.allocationCancelled(e.allocationId(), now);
        classChanges.allocationCancelled(e.allocationId(), e.studentId(), now);
        stayRequests.allocationCancelled(e.allocationId(), now);
    }
}
