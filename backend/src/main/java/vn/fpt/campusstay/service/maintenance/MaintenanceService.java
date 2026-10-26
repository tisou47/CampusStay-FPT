package vn.fpt.campusstay.service.maintenance;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.setting.Lookups;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.event.MaintenanceReported;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.common.file.FileStore;
import vn.fpt.campusstay.repository.maintenance.RequestStore;

/**
 * The student side of Maintenance Requests: report a problem in the Room the
 * student is checked in to (with photos), follow it, and confirm the fix or
 * reopen it. Also the option lists both portals use.
 */
@Service
public class MaintenanceService {

    public record StaffOption(String id, String name, List<String> skills) {
    }

    public record Options(List<String> categories, List<String> locations, List<String> priorities,
            List<StaffOption> staff) {
    }

    public record Photo(String name, byte[] bytes) {
    }

    public record ReportCommand(String title, String description, String category, String location, String urgency,
            String staffMayEnter, List<Photo> photos) {
    }

    public record Created(String id) {
    }

    public record StudentEvent(String who, Instant at, String message) {
    }

    public record StudentView(String id, String title, String status, String room, String category, String location,
            Instant reportedAt, String assignee, String visitWindow, String description, List<StudentEvent> events) {
    }

    static final String MAINTENANCE = "MAINTENANCE";

    private final JdbcClient jdbc;
    private final RequestStore requests;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final Residences residences;
    private final UserDirectory users;
    private final Lookups lookups;
    private final Parameters parameters;
    private final FileStore files;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public MaintenanceService(JdbcClient jdbc, RequestStore requests, CurrentUser currentUser, BlockScope blockScope,
            Residences residences, UserDirectory users, Lookups lookups, Parameters parameters, FileStore files,
            ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.requests = requests;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.residences = residences;
        this.users = users;
        this.lookups = lookups;
        this.parameters = parameters;
        this.files = files;
        this.events = events;
        this.clock = clock;
    }

    /** @param forWhom {@code student} or {@code staff}; the staff list needs a back-office user */
    @Transactional(readOnly = true)
    public Options options(String forWhom) {
        AuthenticatedUser user = currentUser.get();
        List<String> categories = labels("MAINTENANCE_CATEGORY");
        List<String> locations = labels("MAINTENANCE_LOCATION");
        if (!"staff".equalsIgnoreCase(forWhom == null ? "" : forWhom.trim()) || !user.role().isBackOffice()) {
            return new Options(categories, locations, List.of(), List.of());
        }
        List<Lookups.Lookup> handles = lookups.list("STAFF_HANDLE");
        Map<String, String> handleLabels = handles.stream()
                .collect(Collectors.toMap(Lookups.Lookup::code, Lookups.Lookup::label));
        List<String> order = handles.stream().map(Lookups.Lookup::code).toList();
        List<StaffOption> staff = users.staffOf(blockScope.resolve(null).ids()).stream()
                .sorted(Comparator.comparing((UserDirectory.StaffMember m) -> !m.handles().contains(MAINTENANCE))
                        .thenComparing(UserDirectory.StaffMember::name))
                .map(m -> new StaffOption(String.valueOf(m.userId()), m.name(), m.handles().stream()
                        .filter(handleLabels::containsKey)
                        .sorted(Comparator.comparing((String h) -> !h.equals(MAINTENANCE)).thenComparing(order::indexOf))
                        .map(handleLabels::get).toList()))
                .toList();
        return new Options(categories, locations, RequestStore.PRIORITY_LABELS, staff);
    }

    @Transactional
    public Created report(ReportCommand cmd) {
        long me = currentUser.require(Role.STUDENT).userId();
        Residences.Residence home = residences.current(me).filter(Residences.Residence::resident)
                .orElseThrow(() -> ApiException.conflict("NOT_CHECKED_IN",
                        "You can report a problem once you have checked in to your Room."));
        FieldErrors errors = new FieldErrors();
        String title = cmd.title() == null ? "" : cmd.title().trim();
        String description = cmd.description() == null ? "" : cmd.description().trim();
        errors.check(!title.isEmpty(), "title", "Give the problem a short title.");
        errors.check(title.length() <= 150, "title", "Keep the title under 150 characters.");
        errors.check(!description.isEmpty(), "description", "Describe the problem.");
        errors.check(description.length() <= 2000, "description", "Keep the description under 2,000 characters.");
        String category = lookups.find("MAINTENANCE_CATEGORY", cmd.category() == null ? "" : cmd.category().trim())
                .map(Lookups.Lookup::code).orElse(null);
        errors.check(category != null, "category", "Choose a category.");
        String location = lookups.find("MAINTENANCE_LOCATION", cmd.location() == null ? "" : cmd.location().trim())
                .map(Lookups.Lookup::code).orElse(null);
        errors.check(location != null, "location", "Choose where the problem is.");
        String urgency = RequestStore.urgencyCode(cmd.urgency() == null ? "Normal" : cmd.urgency()).orElse(null);
        errors.check(urgency != null, "urgency", "Choose Normal or Urgent.");
        List<Photo> photos = cmd.photos() == null ? List.of()
                : cmd.photos().stream().filter(p -> p.bytes() != null && p.bytes().length > 0).toList();
        int maxPhotos = parameters.intValue("upload.max_photos");
        long maxBytes = parameters.intValue("upload.max_photo_mb") * 1024L * 1024L;
        errors.check(photos.size() <= maxPhotos, "photos", "Attach at most " + maxPhotos + " photos.");
        errors.check(photos.stream().allMatch(p -> p.bytes().length <= maxBytes), "photos",
                "Each photo must be " + parameters.intValue("upload.max_photo_mb") + " MB or smaller.");
        errors.throwIfAny();

        Instant now = Instant.now(clock);
        boolean staffMayEnter = Boolean.parseBoolean(cmd.staffMayEnter() == null ? "false" : cmd.staffMayEnter().trim());
        record Inserted(long id, String code) {
        }
        Inserted row = jdbc.sql("""
                WITH next AS (SELECT nextval(pg_get_serial_sequence('mnt_request', 'id')) AS id)
                INSERT INTO mnt_request (id, code, term_id, room_id, bed_id, building_id, room_code, reporter_id, source,
                                         title, description, category, location, urgency, priority, staff_may_enter,
                                         reported_at)
                OVERRIDING SYSTEM VALUE
                SELECT id, 'MR-' || lpad(id::text, greatest(6, length(id::text)), '0'), :term, :room, :bed, :building,
                       :roomCode, :reporter, 'STUDENT', :title, :description, :category, :location, :urgency, :priority,
                       :mayEnter, :now
                FROM next
                RETURNING id, code
                """)
                .param("term", home.termId()).param("room", home.roomId()).param("bed", home.bedId())
                .param("building", home.buildingId()).param("roomCode", home.room()).param("reporter", me)
                .param("title", title).param("description", description).param("category", category)
                .param("location", location).param("urgency", urgency)
                .param("priority", urgency.equals("URGENT") ? "HIGH" : "MEDIUM").param("mayEnter", staffMayEnter)
                .param("now", Timestamp.from(now))
                .query((rs, i) -> new Inserted(rs.getLong("id"), rs.getString("code"))).single();
        for (Photo photo : photos) {
            long fileId = files.store("mnt", photo.name(), photo.bytes(), FileStore.IMAGES, me).id();
            jdbc.sql("INSERT INTO mnt_request_photo (request_id, file_id) VALUES (:request, :file)")
                    .param("request", row.id()).param("file", fileId).update();
        }
        requests.event(row.id(), me, "STUDENT", "Request submitted", null, false, now);
        events.publishEvent(new MaintenanceReported(row.id(), row.code(), home.buildingId(), category, urgency));
        return new Created(row.code());
    }

    @Transactional(readOnly = true)
    public StudentView studentView(String idOrCode) {
        RequestStore.Request r = own(idOrCode, false);
        List<RequestStore.Event> history = requests.events(r.id()).stream().filter(e -> !e.internal()).toList();
        List<Long> people = new ArrayList<>(history.stream().map(RequestStore.Event::actorId)
                .filter(Objects::nonNull).toList());
        if (r.assigneeId() != null) {
            people.add(r.assigneeId());
        }
        Map<Long, String> names = users.displayNames(Set.copyOf(people));
        return new StudentView(r.code(), r.title(), RequestStore.statusLabel(r.status()), r.roomCode(),
                label("MAINTENANCE_CATEGORY", r.category()), label("MAINTENANCE_LOCATION", r.location()), r.reportedAt(),
                r.assigneeId() == null ? null : names.get(r.assigneeId()),
                RequestStore.visitWindow(r.visitStart(), r.visitEnd()), r.description(),
                history.stream().map(e -> new StudentEvent(e.actorId() == null ? "CampusStay" : names.get(e.actorId()),
                        e.at(), e.message() != null ? e.message() : e.text())).toList());
    }

    /** The student confirms the fix (closed) or says it is not fixed (back to the assignee). */
    @Transactional
    public void confirm(String idOrCode, Boolean fixed, String comment) {
        if (fixed == null) {
            throw FieldErrors.single("fixed", "Say whether the problem is fixed.");
        }
        RequestStore.Request r = own(idOrCode, true);
        if (!r.status().equals("RESOLVED")) {
            throw ApiException.conflict("NOT_RESOLVED", "You can confirm the fix once the request is resolved.");
        }
        Instant now = Instant.now(clock);
        String note = comment == null || comment.isBlank() ? null : comment.trim();
        if (fixed) {
            jdbc.sql("""
                    UPDATE mnt_request SET status = 'CLOSED', closed_at = :now, confirmed_fixed = TRUE, version = version + 1
                    WHERE id = :id
                    """).param("now", Timestamp.from(now)).param("id", r.id()).update();
            requests.event(r.id(), r.reporterId(), "STUDENT", "Fix confirmed by the student", note, false, now);
        } else {
            jdbc.sql("""
                    UPDATE mnt_request SET status = :status, resolved_at = NULL, confirmed_fixed = FALSE,
                           reopen_count = reopen_count + 1, version = version + 1
                    WHERE id = :id
                    """).param("status", r.assigneeId() == null ? "SUBMITTED" : "ASSIGNED").param("id", r.id()).update();
            requests.event(r.id(), r.reporterId(), "STUDENT", "Reopened: not fixed yet", note, false, now);
        }
    }

    /** The signed-in student's own request; anyone else's is 404. */
    private RequestStore.Request own(String idOrCode, boolean lock) {
        long me = currentUser.require(Role.STUDENT).userId();
        return requests.find(idOrCode, lock).filter(r -> r.reporterId() == me)
                .orElseThrow(() -> ApiException.notFound("This Maintenance Request does not exist."));
    }

    private List<String> labels(String listKey) {
        return lookups.list(listKey).stream().map(Lookups.Lookup::label).toList();
    }

    String label(String listKey, String code) {
        return lookups.find(listKey, code).map(Lookups.Lookup::label).orElse(code);
    }
}
