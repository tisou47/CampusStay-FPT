package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.file.FileLinks;
import vn.fpt.campusstay.common.file.FileStore;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.event.CheckInInventorySubmitted;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * The student's check-in inventory (My Room). When the four conditions hold (paid, check-in started, the Room's code
 * confirmed, not past the arrival deadline) the student starts it at the Room: they receive the door code and have
 * {@code handover.submit_hours} to answer each item of their Bed and the Room's shared items and read the meters.
 * The student never sees what inspections recorded: the comparison is for Staff only. For a shared Room the shared
 * items show what roommates' final inventories said, to confirm or correct.
 */
@Service
public class StudentHandoverService {

    /** One of the four conditions of "Start check-in inventory". */
    public record Check(String key, String label, boolean passed) {
    }

    public record Photo(String id, String url) {
    }

    /**
     * @param roommateCondition for a shared item: what a roommate's final inventory said (to confirm or correct)
     * @param staffCondition    after a visit: what Staff found in the Room
     */
    public record Item(String itemId, String assetCode, String type, String typeVi, String bed, boolean personal,
            String condition, String note, String roommateCondition, String staffCondition, String staffNote,
            List<Photo> photos) {
    }

    /**
     * @param status Not needed, Waiting, Ready, Draft, Submitted, Verifying, Final
     * @param toAgree Staff recorded the Room in a visit: the student reads and agrees
     */
    public record View(String id, String status, String room, String bed, List<Check> checks, Instant openedAt,
            Instant dueAt, Instant submittedAt, Instant visitAt, boolean toAgree, Instant finalizedAt,
            Instant utilityFrom, String source, BigDecimal electricity, BigDecimal water, BigDecimal staffElectricity,
            BigDecimal staffWater, List<Photo> meterPhotos, List<Item> items, boolean photosRequired, int maxPhotos,
            String studentComment, boolean lateAllowed, String lateNote) {
    }

    public record ItemAnswer(String itemId, String condition, String note) {
    }

    public record SaveCommand(List<ItemAnswer> items, BigDecimal electricity, BigDecimal water) {
    }

    public record Started(String id, Instant dueAt) {
    }

    private static final Map<String, String> CONDITIONS = Map.of("GOOD", "Good", "WORN", "Worn", "DAMAGED", "Damaged",
            "MISSING", "Missing");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final int NOTE_MAX = 300;

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final HandoverCore core;
    private final DoorCodeRelease release;
    private final TermCatalog terms;
    private final Billing billing;
    private final Inventory inventory;
    private final Parameters parameters;
    private final FileStore files;
    private final FileLinks links;
    private final UserDirectory users;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public StudentHandoverService(JdbcClient jdbc, CurrentUser currentUser, HandoverCore core, DoorCodeRelease release,
            TermCatalog terms, Billing billing, Inventory inventory, Parameters parameters, FileStore files,
            FileLinks links, UserDirectory users, ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.core = core;
        this.release = release;
        this.terms = terms;
        this.billing = billing;
        this.inventory = inventory;
        this.parameters = parameters;
        this.files = files;
        this.links = links;
        this.users = users;
        this.events = events;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public View mine() {
        long me = currentUser.require(Role.STUDENT).userId();
        Optional<HandoverCore.Alloc> alloc = focus(me);
        if (alloc.isEmpty()) {
            return empty("Not needed", null, List.of());
        }
        HandoverCore.Alloc a = alloc.get();
        Inventory.BedSlot bed = inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId());
        Optional<HandoverCore.Row> live = core.ofAllocation(a.id(), false);
        if (live.isEmpty()) {
            List<Check> checks = checks(a, bed);
            boolean ready = checks.stream().allMatch(Check::passed);
            return empty(ready ? "Ready" : "Waiting", bed, checks);
        }
        return view(live.get(), a, bed);
    }

    /**
     * The student is at the Room: checks the four conditions again, releases the door code and opens the inventory.
     * Utility is not counted until the inventory is final.
     */
    @Transactional
    public Started start() {
        long me = currentUser.require(Role.STUDENT).userId();
        HandoverCore.Alloc a = focus(me).orElseThrow(() -> ApiException.conflict("NO_INVENTORY_NEEDED",
                "You have no Room to receive with a check-in inventory."));
        lockAllocation(a.id());
        if (core.ofAllocation(a.id(), true).isPresent()) {
            throw ApiException.conflict("INVENTORY_STARTED", "Your check-in inventory is already started.");
        }
        Inventory.BedSlot bed = inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId());
        List<String> missing = checks(a, bed).stream().filter(c -> !c.passed()).map(Check::label).toList();
        if (!missing.isEmpty()) {
            throw ApiException.conflict("CHECK_IN_NOT_READY", "You cannot receive the Room yet: "
                    + String.join("; ", missing) + ".");
        }
        if (a.codeReleasedAt() == null && !release.releaseForInventory(a.id())) {
            throw ApiException.conflict("CHECK_IN_NOT_READY", "The door code cannot be released yet. Try again later.");
        }
        Instant now = Instant.now(clock);
        long id = core.open(a, bed, now);
        Instant due = core.byId(id, false).orElseThrow().dueAt();
        return new Started(HandoverCore.code(id), due);
    }

    /** Saves the answers given so far (a draft). Items not sent stay as they are. */
    @Transactional
    public View save(SaveCommand cmd) {
        AuthenticatedUser user = currentUser.require(Role.STUDENT);
        HandoverCore.Row h = draft(user.userId());
        write(h, cmd);
        HandoverCore.Alloc a = core.allocation(h.allocationId()).orElseThrow();
        return view(core.byId(h.id(), false).orElseThrow(), a,
                inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId()));
    }

    /** Adds a photo of an item ({@code itemId}) or of the meters (no item). */
    @Transactional
    public Photo addPhoto(String itemId, String fileName, byte[] bytes) {
        AuthenticatedUser user = currentUser.require(Role.STUDENT);
        HandoverCore.Row h = draft(user.userId());
        Long item = null;
        if (itemId != null && !itemId.isBlank()) {
            item = parseItem(itemId);
            Long chosen = item;
            if (core.items(h.id()).stream().noneMatch(i -> i.itemId() == chosen)) {
                throw FieldErrors.single("itemId", "Choose an item of your inventory.");
            }
        }
        Long target = item;
        long already = core.photos(h.id()).stream().filter(p -> Objects.equals(p.itemId(), target)).count();
        int max = parameters.intValue("handover.max_photos");
        if (already >= max) {
            throw FieldErrors.single("photo", "Add at most " + max + " photos per item.");
        }
        if (bytes == null || bytes.length == 0) {
            throw FieldErrors.single("photo", "Choose a photo.");
        }
        FileStore.StoredFile file = files.store("asg", fileName, bytes, FileStore.IMAGES, user.userId());
        long id = jdbc.sql("""
                INSERT INTO asg_handover_photo (handover_id, furniture_item_id, file_id, taken_by, created_at)
                VALUES (:h, :item, :file, :by, :now) RETURNING id
                """).param("h", h.id()).param("item", item).param("file", file.id()).param("by", user.userId())
                .param("now", Timestamp.from(Instant.now(clock))).query(Long.class).single();
        return new Photo(String.valueOf(id), links.link(file.id()));
    }

    @Transactional
    public void removePhoto(String photoId) {
        AuthenticatedUser user = currentUser.require(Role.STUDENT);
        HandoverCore.Row h = draft(user.userId());
        long id;
        try {
            id = Long.parseLong(photoId.trim());
        } catch (RuntimeException e) {
            throw ApiException.notFound("This photo does not exist.");
        }
        int deleted = jdbc.sql("DELETE FROM asg_handover_photo WHERE id = :id AND handover_id = :h")
                .param("id", id).param("h", h.id()).update();
        if (deleted == 0) {
            throw ApiException.notFound("This photo does not exist.");
        }
    }

    /**
     * Files the inventory: every item answered and both meters read (not lower than the Room's latest reading). The
     * comparison with the Room's record decides what happens: Matched is final at once, a difference waits for
     * Staff. The student cannot change it afterwards.
     */
    @Transactional
    public View submit(SaveCommand cmd) {
        AuthenticatedUser user = currentUser.require(Role.STUDENT);
        HandoverCore.Row h = draft(user.userId());
        if (cmd != null) {
            write(h, cmd);
        }
        h = core.byId(h.id(), true).orElseThrow();
        List<HandoverCore.ItemRow> items = core.items(h.id());
        FieldErrors errors = new FieldErrors();
        errors.check(items.stream().allMatch(i -> i.condition() != null), "items",
                "Answer every item before you submit.");
        errors.check(h.electricity() != null, "electricity", "Enter the electricity reading (kWh).");
        errors.check(h.water() != null, "water", "Enter the water reading (m³).");
        if (parameters.boolValue("handover.photos_required")) {
            List<HandoverCore.PhotoRow> photos = core.photos(h.id());
            Set<Long> withPhoto = photos.stream().map(HandoverCore.PhotoRow::itemId).filter(Objects::nonNull)
                    .collect(Collectors.toSet());
            errors.check(photos.stream().anyMatch(p -> p.itemId() == null), "meterPhotos", "Add a photo of the meters.");
            errors.check(items.stream().filter(i -> "DAMAGED".equals(i.condition()) || "MISSING".equals(i.condition()))
                    .allMatch(i -> withPhoto.contains(i.itemId())), "items",
                    "Add a photo of every Damaged or Missing item.");
        }
        errors.throwIfAny();
        // Never reveal the Room's baseline meter numbers or date to a student in the error response.
        billing.lastReading(h.roomId()).ifPresent(last -> {
            if (h.electricity().compareTo(last.electricity()) < 0) {
                throw FieldErrors.single("electricity",
                        "The reading cannot be lower than the meter's previous reading. Please check the meter in the Room again.");
            }
            if (h.water().compareTo(last.water()) < 0) {
                throw FieldErrors.single("water",
                        "The reading cannot be lower than the meter's previous reading. Please check the meter in the Room again.");
            }
        });
        Instant now = Instant.now(clock);
        jdbc.sql("UPDATE asg_handover SET status = 'SUBMITTED', submitted_at = :now, version = version + 1 WHERE id = :id")
                .param("now", Timestamp.from(now)).param("id", h.id()).update();
        HandoverCore.Alloc a = core.allocation(h.allocationId()).orElseThrow();
        HandoverCore.Row submitted = core.byId(h.id(), false).orElseThrow();
        HandoverComparison.Result result = core.compare(submitted, a);
        Inventory.BedSlot bed = inventory.beds(a.termId(), List.of(a.bedId())).get(a.bedId());
        if (result.level().equals("MATCHED")) {
            core.finalize(core.byId(h.id(), false).orElseThrow(), a, "STUDENT", null, now);
        } else if (bed != null) {
            List<Long> staff = users.staffOf(List.of(bed.buildingId())).stream().map(UserDirectory.StaffMember::userId)
                    .toList();
            events.publishEvent(new CheckInInventorySubmitted(users.displayNames(List.of(user.userId()))
                    .getOrDefault(user.userId(), ""), bed.roomCode(), HandoverCore.COMPARISONS.get(result.level()), staff));
        }
        return view(core.byId(h.id(), false).orElseThrow(), a, bed);
    }

    /**
     * After a visit the student agrees with what Staff recorded; a comment may say what they still see differently.
     * The inventory is final either way: there is no dispute.
     */
    @Transactional
    public View agree(String comment) {
        AuthenticatedUser user = currentUser.require(Role.STUDENT);
        HandoverCore.Alloc a = focus(user.userId()).orElseThrow(() -> ApiException.notFound("You have no inventory."));
        HandoverCore.Row h = core.ofAllocation(a.id(), true)
                .orElseThrow(() -> ApiException.notFound("You have no inventory."));
        if (!h.status().equals("VERIFYING") || h.verifiedAt() == null) {
            throw ApiException.conflict("NOTHING_TO_AGREE", "Staff have not sent you the checked inventory yet.");
        }
        String text = comment == null || comment.isBlank() ? null : comment.trim();
        if (text != null && text.length() > 500) {
            throw FieldErrors.single("comment", "Keep your comment under 500 characters.");
        }
        jdbc.sql("UPDATE asg_handover SET student_comment = :c, version = version + 1 WHERE id = :id")
                .param("c", text).param("id", h.id()).update();
        core.finalize(core.byId(h.id(), false).orElseThrow(), a, "VERIFIED", user.userId(), Instant.now(clock));
        return mine();
    }

    /**
     * The deadline passed and the Room's record was used: the student may still report, once, what they found
     * (Staff decide whether it was there before them).
     */
    @Transactional
    public View late(String note) {
        AuthenticatedUser user = currentUser.require(Role.STUDENT);
        HandoverCore.Alloc a = focus(user.userId()).orElseThrow(() -> ApiException.notFound("You have no inventory."));
        HandoverCore.Row h = core.ofAllocation(a.id(), true)
                .orElseThrow(() -> ApiException.notFound("You have no inventory."));
        if (!h.status().equals("FINAL") || !"AUTO".equals(h.source())) {
            throw ApiException.conflict("LATE_NOT_ALLOWED", "Only an inventory closed by its deadline takes a late report.");
        }
        if (h.lateSubmittedAt() != null) {
            throw ApiException.conflict("LATE_ALREADY_SENT", "You already sent a late report.");
        }
        String text = note == null ? "" : note.trim();
        if (text.isEmpty() || text.length() > 500) {
            throw FieldErrors.single("note", "Describe what you found in at most 500 characters.");
        }
        jdbc.sql("UPDATE asg_handover SET late_note = :n, late_submitted_at = :now, version = version + 1 WHERE id = :id")
                .param("n", text).param("now", Timestamp.from(Instant.now(clock))).param("id", h.id()).update();
        return mine();
    }

    // ---------------------------------------------------------------- helpers

    /**
     * The Allocation the inventory is about: one with an inventory not final yet, else one that will need it (its
     * code not released, or released for an inventory that was cancelled), else the latest one with a final
     * inventory.
     */
    private Optional<HandoverCore.Alloc> focus(long studentId) {
        List<Long> ids = jdbc.sql("""
                SELECT a.id FROM asg_allocation a
                LEFT JOIN asg_handover h ON h.allocation_id = a.id AND h.status <> 'CANCELLED'
                WHERE a.student_id = :s AND a.status = 'ACTIVE'
                  AND (h.id IS NOT NULL OR a.handover_needed OR a.code_released_at IS NULL)
                ORDER BY CASE WHEN h.status IN ('DRAFT', 'SUBMITTED', 'VERIFYING') THEN 0
                              WHEN h.id IS NULL THEN 1 ELSE 2 END, a.id DESC
                """).param("s", studentId).query(Long.class).list();
        for (long id : ids) {
            HandoverCore.Alloc a = core.allocation(id).orElseThrow();
            boolean live = core.ofAllocation(id, false).isPresent();
            if (live || a.handoverNeeded()) {
                return Optional.of(a);
            }
            if (a.codeReleasedAt() == null && parameters.boolValue("handover.required")
                    && release.needsInventory(previousBed(a.id()), a.bedId())) {
                return Optional.of(a);
            }
        }
        return Optional.empty();
    }

    private Long previousBed(long allocationId) {
        return jdbc.sql("""
                SELECT p.bed_id FROM asg_allocation a JOIN asg_allocation p ON p.id = a.previous_allocation_id
                WHERE a.id = :id
                """).param("id", allocationId).query(Long.class).optional().orElse(null);
    }

    /** The four conditions of spec "Start check-in inventory", checked again by {@link #start()}. */
    private List<Check> checks(HandoverCore.Alloc a, Inventory.BedSlot bed) {
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        TermSummary term = terms.findPublished(a.termId()).orElse(null);
        List<Check> checks = new ArrayList<>();
        boolean paid = a.renewal() != null
                ? jdbc.sql("SELECT fee_paid_at IS NOT NULL FROM asg_allocation WHERE id = :id").param("id", a.id())
                        .query(Boolean.class).single()
                : !billing.checkInDues(List.of(a.id())).containsKey(a.id());
        checks.add(new Check("paid", a.renewal() != null ? "Next-Term fee paid" : "Balance paid", paid));
        LocalDate start = term == null ? null : term.checkInStart() != null ? term.checkInStart() : term.stayStart();
        checks.add(new Check("checkInStarted", start == null ? "Check-in has started"
                : "Check-in has started (from " + DAY.format(start) + ")", start != null && !today.isBefore(start)));
        boolean codeReady = a.codeReleasedAt() != null
                || bed != null && inventory.doorCodeReady(List.of(bed.roomId())).contains(bed.roomId());
        checks.add(new Check("doorCode", "The Room's door code is set", codeReady));
        LocalDate end = term == null ? null : term.checkInEnd();
        Optional<LocalDate> late = jdbc.sql("""
                SELECT deadline FROM asg_late_check_in
                WHERE allocation_id = :id AND status = 'APPROVED' AND deadline IS NOT NULL
                ORDER BY deadline DESC LIMIT 1
                """).param("id", a.id()).query(LocalDate.class).optional();
        LocalDate deadline = late.filter(d -> end == null || d.isAfter(end)).orElse(end);
        checks.add(new Check("notLate", deadline == null ? "Within the check-in period"
                : "Within the check-in period (until " + DAY.format(deadline) + ")",
                a.codeReleasedAt() != null || deadline == null || !today.isAfter(deadline)));
        return checks;
    }

    private HandoverCore.Row draft(long studentId) {
        HandoverCore.Alloc a = focus(studentId).orElseThrow(() -> ApiException.notFound("You have no inventory."));
        HandoverCore.Row h = core.ofAllocation(a.id(), true)
                .orElseThrow(() -> ApiException.conflict("INVENTORY_NOT_STARTED", "Start the check-in inventory first."));
        if (!h.status().equals("DRAFT")) {
            throw ApiException.conflict("INVENTORY_SUBMITTED", "Your check-in inventory is already submitted.");
        }
        return h;
    }

    private void write(HandoverCore.Row h, SaveCommand cmd) {
        if (cmd == null) {
            return;
        }
        Set<Long> mine = core.items(h.id()).stream().map(HandoverCore.ItemRow::itemId).collect(Collectors.toSet());
        Map<Long, ItemAnswer> answers = new HashMap<>();
        for (ItemAnswer answer : cmd.items() == null ? List.<ItemAnswer>of() : cmd.items()) {
            if (answer == null) {
                continue;
            }
            long item = parseItem(answer.itemId());
            if (!mine.contains(item)) {
                throw FieldErrors.single("items", "Answer only the items of your inventory.");
            }
            answers.put(item, answer);
        }
        FieldErrors errors = new FieldErrors();
        errors.check(cmd.electricity() == null || cmd.electricity().signum() >= 0, "electricity",
                "Enter the electricity reading (kWh).");
        errors.check(cmd.water() == null || cmd.water().signum() >= 0, "water", "Enter the water reading (m³).");
        errors.throwIfAny();
        answers.forEach((item, answer) -> {
            String condition = condition(answer.condition());
            String note = answer.note() == null || answer.note().isBlank() ? null : answer.note().trim();
            if (note != null && note.length() > NOTE_MAX) {
                throw FieldErrors.single("items", "Keep each note under " + NOTE_MAX + " characters.");
            }
            jdbc.sql("""
                    UPDATE asg_handover_item SET condition = :c, note = :n WHERE handover_id = :h AND furniture_item_id = :i
                    """).param("c", condition).param("n", note).param("h", h.id()).param("i", item).update();
        });
        if (cmd.electricity() != null || cmd.water() != null) {
            jdbc.sql("""
                    UPDATE asg_handover SET electricity = coalesce(:e, electricity), water = coalesce(:w, water),
                           version = version + 1
                    WHERE id = :id
                    """).param("e", cmd.electricity()).param("w", cmd.water()).param("id", h.id()).update();
        }
    }

    static String condition(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.trim();
        return CONDITIONS.entrySet().stream().filter(e -> e.getKey().equalsIgnoreCase(v) || e.getValue().equalsIgnoreCase(v))
                .map(Map.Entry::getKey).findFirst()
                .orElseThrow(() -> FieldErrors.single("items", "Choose Good, Worn, Damaged or Missing."));
    }

    static long parseItem(String itemId) {
        try {
            return Long.parseLong(itemId == null ? "" : itemId.trim().replaceFirst("^furniture-", ""));
        } catch (NumberFormatException e) {
            throw FieldErrors.single("itemId", "Choose an item of your inventory.");
        }
    }

    private void lockAllocation(long id) {
        jdbc.sql("SELECT id FROM asg_allocation WHERE id = :id FOR UPDATE").param("id", id).query(Long.class).single();
    }

    private View empty(String status, Inventory.BedSlot bed, List<Check> checks) {
        return new View(null, status, bed == null ? null : bed.roomCode(), bed == null ? null : bed.bedLabel(), checks,
                null, null, null, null, false, null, null, null, null, null, null, null, List.of(), List.of(),
                parameters.boolValue("handover.photos_required"), parameters.intValue("handover.max_photos"), null, false,
                null);
    }

    /** The student's view: never the Room's record nor the comparison (Staff only). */
    private View view(HandoverCore.Row h, HandoverCore.Alloc a, Inventory.BedSlot bed) {
        Map<Long, Inventory.FurnitureLine> lines = new HashMap<>();
        inventory.furnitureLines(h.roomId()).forEach(l -> lines.put(l.id(), l));
        List<HandoverCore.PhotoRow> photos = core.photos(h.id());
        Map<Long, String> roommates = core.roommateAnswers(h.roomId(), a.id());
        boolean visited = h.verifiedAt() != null;
        List<Item> items = core.items(h.id()).stream().map(i -> {
            Inventory.FurnitureLine line = lines.get(i.itemId());
            boolean personal = line != null && line.personal() && line.bedId() != null;
            return new Item("furniture-" + i.itemId(), line == null ? null : line.assetCode(),
                    line == null ? null : line.type(), line == null ? null : line.typeVi(),
                    line == null ? null : line.bedLabel(), personal, label(i.condition()), i.note(),
                    personal ? null : label(roommates.get(i.itemId())), visited ? label(i.verified()) : null,
                    visited ? i.verifiedNote() : null,
                    photos.stream().filter(p -> Objects.equals(p.itemId(), i.itemId()))
                            .map(p -> new Photo(String.valueOf(p.id()), links.link(p.fileId()))).toList());
        }).toList();
        List<Photo> meterPhotos = photos.stream().filter(p -> p.itemId() == null)
                .map(p -> new Photo(String.valueOf(p.id()), links.link(p.fileId()))).toList();
        String status = HandoverCore.STATUSES.get(h.status());
        return new View(HandoverCore.code(h.id()), status, bed == null ? null : bed.roomCode(),
                bed == null ? null : bed.bedLabel(), List.of(), h.openedAt(), h.dueAt(), h.submittedAt(), h.visitAt(),
                h.status().equals("VERIFYING") && visited, h.finalizedAt(), h.utilityFrom(),
                h.source() == null ? null : switch (h.source()) {
                    case "AUTO" -> "Deadline passed";
                    case "VERIFIED" -> "Checked with Staff";
                    default -> "As you filed it";
                }, h.electricity(), h.water(), visited ? h.verifiedElectricity() : null,
                visited ? h.verifiedWater() : null, meterPhotos, items,
                parameters.boolValue("handover.photos_required"), parameters.intValue("handover.max_photos"),
                h.studentComment(), h.status().equals("FINAL") && "AUTO".equals(h.source()) && h.lateSubmittedAt() == null,
                h.lateNote());
    }

    static String label(String condition) {
        return condition == null ? null : CONDITIONS.get(condition);
    }
}
