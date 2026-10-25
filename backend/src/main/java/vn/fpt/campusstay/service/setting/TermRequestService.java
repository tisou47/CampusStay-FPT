package vn.fpt.campusstay.service.setting;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.event.TermRequestCommented;
import vn.fpt.campusstay.event.TermRequestDecided;
import vn.fpt.campusstay.event.TermRequestSubmitted;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;

/**
 * Registration-period requests (spec §6.3, D-10, D-11): a Manager asks the Admin to open a Term with dates, Blocks,
 * Rooms, places and prices; the Admin and the other Managers are told; other Managers comment; the Admin takes it in
 * progress, sends it back for changes or rejects it, builds the Term from it in the wizard and publishes it (Done).
 * One open request per target Term (by name, {@code ux_term_request_open}).
 */
@Service
public class TermRequestService {

    public record Summary(String id, String code, String termName, LocalDate stayStart, LocalDate stayEnd,
            String status, String requestedBy, Instant requestedAt, Instant updatedAt, long comments, String termId) {
    }

    /** {@code counts}: requests per status label, over every request. */
    public record RequestList(List<Summary> items, long total, Map<String, Long> counts) {
    }

    /** What a Manager sends; ids are strings or numbers (ADR-15). */
    public record Body(String termName, LocalDate stayStart, LocalDate stayEnd, TermPlan.Timeline timeline,
            List<String> blocks, List<String> excludedRooms, List<TermPlan.Places> places, List<TermPlan.Price> prices,
            String notes) {
    }

    public record PlacesRow(String roomTypeId, String roomType, String roomClassId, String roomClass, String gender,
            int places) {
    }

    /** {@code defaultPrice}: the default price per Bed (base price × surcharge) to compare with. */
    public record PriceRow(String roomTypeId, String roomType, String roomClassId, String roomClass, long price,
            Long defaultPrice) {
    }

    /** {@code kind}: Submitted, Updated, Comment, In progress, Needs changes, Rejected, Draft built, Published. */
    public record HistoryItem(String kind, String actor, String note, Instant at) {
    }

    public record TermLink(String id, String name, String status) {
    }

    /** What the signed-in user may do with the request now. */
    public record Actions(boolean edit, boolean comment, boolean decide, boolean build) {
    }

    public record Detail(String id, String code, String termName, LocalDate stayStart, LocalDate stayEnd, String status,
            String requestedById, String requestedBy, Instant requestedAt, Instant updatedAt, String notes,
            TermPlan.Timeline timeline, List<String> blocks, List<String> excludedRooms, List<PlacesRow> places,
            List<PriceRow> prices, String decisionNote, TermLink term, List<TermPlan.Difference> differences,
            List<HistoryItem> history, Actions actions) {
    }

    /** {@code status}: In progress, Needs changes or Rejected; a note is needed for the last two. */
    public record Decision(String status, String note) {
    }

    /** The request a Draft is built from (for the wizard). */
    record Built(long id, String code, String termName, LocalDate stayStart, LocalDate stayEnd, long requesterId,
            String status, Long termId, TermPlan.Proposal proposal) {
    }

    static final Map<String, String> STATUS = Map.of("SUBMITTED", "Submitted", "IN_PROGRESS", "In progress",
            "NEEDS_CHANGES", "Needs changes", "DONE", "Done", "REJECTED", "Rejected");
    private static final List<String> STATUS_ORDER = List.of("SUBMITTED", "IN_PROGRESS", "NEEDS_CHANGES", "DONE",
            "REJECTED");
    private static final Set<String> OPEN = Set.of("SUBMITTED", "IN_PROGRESS", "NEEDS_CHANGES");
    private static final Map<String, String> KINDS = Map.of("SUBMITTED", "Submitted", "UPDATED", "Updated", "COMMENT",
            "Comment", "IN_PROGRESS", "In progress", "NEEDS_CHANGES", "Needs changes", "REJECTED", "Rejected", "BUILT",
            "Draft built", "DONE", "Published");
    private static final long MAX_PRICE = 1_000_000_000L;
    private static final int MAX_PLACES = 100_000;

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final CurrentUser currentUser;
    private final UserDirectory users;
    private final Catalog catalog;
    private final TermSupply supply;
    private final FeePolicy fees;
    private final TermDrafts drafts;
    private final TermDifferences differences;
    private final AuditLog audit;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public TermRequestService(JdbcClient jdbc, JsonMapper json, CurrentUser currentUser, UserDirectory users,
            Catalog catalog, TermSupply supply, FeePolicy fees, TermDrafts drafts, TermDifferences differences,
            AuditLog audit, ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.json = json;
        this.currentUser = currentUser;
        this.users = users;
        this.catalog = catalog;
        this.supply = supply;
        this.fees = fees;
        this.drafts = drafts;
        this.differences = differences;
        this.audit = audit;
        this.events = events;
        this.clock = clock;
    }

    private record Row(long id, String code, String termName, LocalDate stayStart, LocalDate stayEnd, String proposal,
            String notes, String status, long requestedBy, Long termId, String decisionNote, Instant createdAt,
            Instant updatedAt) {
    }

    // ---------------------------------------------------------------- reading

    @Transactional(readOnly = true)
    public RequestList list(String status, String q, PageQuery page) {
        currentUser.require(Permission.VIEW_REGISTRATION_PERIODS);
        String code = statusCode(status);
        String search = q == null || q.isBlank() ? null : "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
        String where = """
                WHERE (CAST(:status AS text) IS NULL OR r.status = :status
                       OR (:status = 'OPEN' AND r.status IN ('SUBMITTED', 'IN_PROGRESS', 'NEEDS_CHANGES')))
                  AND (CAST(:q AS text) IS NULL OR lower(r.term_name) LIKE :q OR lower(r.code) LIKE :q)
                """;
        long total = jdbc.sql("SELECT count(*) FROM cfg_term_request r " + where)
                .param("status", code).param("q", search).query(Long.class).single();
        List<Row> rows = jdbc.sql("SELECT r.* FROM cfg_term_request r " + where
                        + " ORDER BY (r.status IN ('SUBMITTED', 'IN_PROGRESS', 'NEEDS_CHANGES')) DESC, r.updated_at DESC, r.id DESC"
                        + " LIMIT :limit OFFSET :offset")
                .param("status", code).param("q", search).param("limit", page.limit()).param("offset", page.offset())
                .query((rs, i) -> row(rs)).list();
        Map<Long, String> names = users.displayNames(rows.stream().map(Row::requestedBy).toList());
        Map<Long, Long> comments = new LinkedHashMap<>();
        if (!rows.isEmpty()) {
            jdbc.sql("""
                    SELECT request_id, count(*) AS n FROM cfg_term_request_event
                    WHERE kind = 'COMMENT' AND request_id IN (:ids) GROUP BY request_id
                    """)
                    .param("ids", rows.stream().map(Row::id).toList())
                    .query((rs, i) -> Map.entry(rs.getLong("request_id"), rs.getLong("n"))).list()
                    .forEach(e -> comments.put(e.getKey(), e.getValue()));
        }
        Map<String, Long> counts = new LinkedHashMap<>();
        STATUS_ORDER.forEach(s -> counts.put(STATUS.get(s), 0L));
        jdbc.sql("SELECT status, count(*) AS n FROM cfg_term_request GROUP BY status")
                .query((rs, i) -> Map.entry(rs.getString("status"), rs.getLong("n"))).list()
                .forEach(e -> counts.put(STATUS.get(e.getKey()), e.getValue()));
        return new RequestList(rows.stream()
                .map(r -> new Summary(String.valueOf(r.id()), r.code(), r.termName(), r.stayStart(), r.stayEnd(),
                        STATUS.get(r.status()), names.get(r.requestedBy()), r.createdAt(), r.updatedAt(),
                        comments.getOrDefault(r.id(), 0L), r.termId() == null ? null : String.valueOf(r.termId())))
                .toList(), total, counts);
    }

    @Transactional(readOnly = true)
    public Detail get(long id) {
        AuthenticatedUser me = currentUser.require(Permission.VIEW_REGISTRATION_PERIODS);
        Row r = find(id, false);
        TermPlan.Proposal proposal = proposal(r);
        Map<Long, String> types = catalog.roomTypes().stream()
                .collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name));
        Map<Long, String> classes = catalog.roomClasses().stream()
                .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name));
        List<PlacesRow> places = proposal.places() == null ? List.of() : proposal.places().stream()
                .map(p -> new PlacesRow(p.roomTypeId(), types.get(Long.valueOf(p.roomTypeId())), p.roomClassId(),
                        classes.get(Long.valueOf(p.roomClassId())), p.gender(), p.places()))
                .toList();
        List<PriceRow> prices = proposal.prices() == null ? List.of() : proposal.prices().stream()
                .map(p -> {
                    long type = Long.parseLong(p.roomTypeId());
                    long roomClass = Long.parseLong(p.roomClassId());
                    var standard = fees.defaultTermPrice(type, roomClass);
                    return new PriceRow(p.roomTypeId(), types.get(type), p.roomClassId(), classes.get(roomClass),
                            p.price(), standard.isPresent() ? standard.getAsLong() : null);
                })
                .toList();
        record Event(String kind, Long actorId, String note, Instant at) {
        }
        List<Event> raw = jdbc.sql("""
                SELECT kind, actor_id, note, at FROM cfg_term_request_event WHERE request_id = :id ORDER BY at, id
                """)
                .param("id", id)
                .query((rs, i) -> new Event(rs.getString("kind"), (Long) rs.getObject("actor_id"), rs.getString("note"),
                        rs.getTimestamp("at").toInstant()))
                .list();
        Set<Long> people = new HashSet<>();
        people.add(r.requestedBy());
        raw.stream().map(Event::actorId).filter(a -> a != null).forEach(people::add);
        Map<Long, String> names = users.displayNames(people);
        List<HistoryItem> history = raw.stream()
                .map(e -> new HistoryItem(KINDS.get(e.kind()), e.actorId() == null ? null : names.get(e.actorId()),
                        e.note(), e.at()))
                .toList();
        TermLink term = null;
        List<TermPlan.Difference> changed = List.of();
        if (r.termId() != null) {
            Optional<TermDrafts.Term> built = drafts.find(r.termId());
            if (built.isPresent()) {
                TermDrafts.Term t = built.get();
                term = new TermLink(String.valueOf(t.id()), t.name(), t.draft() ? "Draft" : "Published");
                changed = differences.of(t, r.termName(), r.stayStart(), r.stayEnd(), proposal);
            }
        }
        boolean open = OPEN.contains(r.status());
        boolean admin = me.is(Role.ADMIN);
        Actions actions = new Actions(
                me.userId() == r.requestedBy() && (r.status().equals("SUBMITTED") || r.status().equals("NEEDS_CHANGES")),
                open, admin && open, admin && (r.status().equals("SUBMITTED") || r.status().equals("IN_PROGRESS")));
        return new Detail(String.valueOf(r.id()), r.code(), r.termName(), r.stayStart(), r.stayEnd(),
                STATUS.get(r.status()), String.valueOf(r.requestedBy()), names.get(r.requestedBy()), r.createdAt(),
                r.updatedAt(), r.notes(), proposal.timeline(), proposal.blocks(), proposal.excludedRooms(), places,
                prices, r.decisionNote(), term, changed, history, actions);
    }

    // ---------------------------------------------------------------- the Manager's request

    @Transactional
    public long create(Body body) {
        AuthenticatedUser me = currentUser.require(Permission.REQUEST_TERMS);
        Clean clean = validate(body, null);
        Instant now = Instant.now(clock);
        long id = jdbc.sql("""
                WITH next AS (SELECT nextval(pg_get_serial_sequence('cfg_term_request', 'id')) AS id)
                INSERT INTO cfg_term_request (id, code, term_name, stay_start, stay_end, proposal, notes, status,
                                              requested_by, created_at, updated_at)
                OVERRIDING SYSTEM VALUE
                SELECT id, 'RP-' || id, :name, :start, :end, CAST(:proposal AS jsonb), :notes, 'SUBMITTED', :by, :now, :now
                FROM next
                RETURNING id
                """)
                .param("name", clean.termName()).param("start", body.stayStart()).param("end", body.stayEnd())
                .param("proposal", json.writeValueAsString(clean.proposal())).param("notes", clean.notes())
                .param("by", me.userId()).param("now", Timestamp.from(now))
                .query(Long.class).single();
        event(id, "SUBMITTED", me.userId(), clean.notes(), now);
        Row r = find(id, false);
        audit.record("TERM_REQUEST_SUBMITTED", AuditLog.Tone.INFO, "Registration-period request", id, r.code(),
                Map.of("term", r.termName()));
        events.publishEvent(new TermRequestSubmitted(id, r.code(), r.termName(), r.stayStart(), r.stayEnd(), me.name(),
                others(Role.ADMIN, me.userId()), others(Role.MANAGER, me.userId())));
        return id;
    }

    /** The requesting Manager changes the request; one sent back for changes is submitted again. */
    @Transactional
    public long update(long id, Body body) {
        AuthenticatedUser me = currentUser.require(Permission.REQUEST_TERMS);
        Row r = find(id, true);
        if (r.requestedBy() != me.userId()) {
            throw ApiException.forbidden("NOT_REQUESTER", "Only the Manager who sent this request can change it.");
        }
        if (!r.status().equals("SUBMITTED") && !r.status().equals("NEEDS_CHANGES")) {
            throw ApiException.conflict("REQUEST_LOCKED", OPEN.contains(r.status())
                    ? "The Admin is building this Term; comment on the request instead."
                    : "This request is closed.");
        }
        Clean clean = validate(body, id);
        Instant now = Instant.now(clock);
        jdbc.sql("""
                UPDATE cfg_term_request SET term_name = :name, stay_start = :start, stay_end = :end,
                       proposal = CAST(:proposal AS jsonb), notes = :notes, status = 'SUBMITTED', updated_at = :now,
                       version = version + 1
                WHERE id = :id
                """)
                .param("name", clean.termName()).param("start", body.stayStart()).param("end", body.stayEnd())
                .param("proposal", json.writeValueAsString(clean.proposal())).param("notes", clean.notes())
                .param("now", Timestamp.from(now)).param("id", id)
                .update();
        boolean resubmitted = r.status().equals("NEEDS_CHANGES");
        event(id, resubmitted ? "SUBMITTED" : "UPDATED", me.userId(), null, now);
        audit.record("TERM_REQUEST_UPDATED", AuditLog.Tone.INFO, "Registration-period request", id, r.code(),
                Map.of("term", clean.termName()));
        if (resubmitted) {
            events.publishEvent(new TermRequestSubmitted(id, r.code(), clean.termName(), body.stayStart(),
                    body.stayEnd(), me.name(), others(Role.ADMIN, me.userId()), others(Role.MANAGER, me.userId())));
        }
        return id;
    }

    @Transactional
    public void comment(long id, String text) {
        AuthenticatedUser me = currentUser.require(Permission.VIEW_REGISTRATION_PERIODS);
        String comment = text == null ? "" : text.trim();
        if (comment.isEmpty() || comment.length() > 1000) {
            throw FieldErrors.single("text", "Write a comment of at most 1,000 characters.");
        }
        Row r = find(id, true);
        if (!OPEN.contains(r.status())) {
            throw ApiException.conflict("REQUEST_CLOSED", "This request is closed.");
        }
        Instant now = Instant.now(clock);
        event(id, "COMMENT", me.userId(), comment, now);
        jdbc.sql("UPDATE cfg_term_request SET updated_at = :now WHERE id = :id")
                .param("now", Timestamp.from(now)).param("id", id).update();
        audit.record("TERM_REQUEST_COMMENTED", AuditLog.Tone.INFO, "Registration-period request", id, r.code(), null);
        Set<Long> managers = new LinkedHashSet<>();
        managers.add(r.requestedBy());
        managers.addAll(jdbc.sql("""
                SELECT DISTINCT e.actor_id FROM cfg_term_request_event e
                WHERE e.request_id = :id AND e.kind = 'COMMENT' AND e.actor_id IS NOT NULL
                """).param("id", id).query(Long.class).list());
        managers.retainAll(users.activeUserIds(Role.MANAGER.name()));
        managers.remove(me.userId());
        events.publishEvent(new TermRequestCommented(id, r.code(), r.termName(), me.name(), comment,
                others(Role.ADMIN, me.userId()), List.copyOf(managers)));
    }

    // ---------------------------------------------------------------- the Admin's answer

    @Transactional
    public void decide(long id, Decision decision) {
        AuthenticatedUser me = currentUser.require(Permission.CONFIGURE);
        String status = decision == null ? null : statusCode(decision.status());
        String note = decision == null || decision.note() == null || decision.note().isBlank() ? null
                : decision.note().trim();
        FieldErrors errors = new FieldErrors();
        errors.check(status != null && Set.of("IN_PROGRESS", "NEEDS_CHANGES", "REJECTED").contains(status), "status",
                "Choose In progress, Needs changes or Rejected.");
        errors.check(note == null || note.length() <= 1000, "note", "Keep the note under 1,000 characters.");
        errors.check(!"NEEDS_CHANGES".equals(status) || note != null, "note", "Say what the Manager should change.");
        errors.check(!"REJECTED".equals(status) || note != null, "note", "Give the reason for rejecting the request.");
        errors.throwIfAny();
        Row r = find(id, true);
        if (!OPEN.contains(r.status())) {
            throw ApiException.conflict("REQUEST_CLOSED", "This request is closed.");
        }
        if (status.equals("IN_PROGRESS") && !r.status().equals("SUBMITTED")) {
            throw ApiException.conflict("REQUEST_NOT_SUBMITTED", "Only a submitted request can be taken in progress.");
        }
        Instant now = Instant.now(clock);
        jdbc.sql("""
                UPDATE cfg_term_request SET status = :status, decision_note = COALESCE(:note, decision_note),
                       updated_at = :now, version = version + 1
                WHERE id = :id
                """)
                .param("status", status).param("note", note).param("now", Timestamp.from(now)).param("id", id)
                .update();
        event(id, status, me.userId(), note, now);
        audit.record("TERM_REQUEST_" + status, status.equals("REJECTED") ? AuditLog.Tone.WARNING : AuditLog.Tone.INFO,
                "Registration-period request", id, r.code(), note == null ? null : Map.of("note", note));
        events.publishEvent(new TermRequestDecided(id, r.code(), r.termName(), status, me.name(), note, r.requestedBy()));
    }

    // ---------------------------------------------------------------- for the wizard

    /** The request the Admin builds a Term from; it must be Submitted or In progress. */
    @Transactional(readOnly = true)
    Built forBuilding(long id) {
        Row r = find(id, false);
        if (!r.status().equals("SUBMITTED") && !r.status().equals("IN_PROGRESS")) {
            throw ApiException.conflict("REQUEST_NOT_BUILDABLE", r.status().equals("NEEDS_CHANGES")
                    ? "This request waits for the Manager's changes."
                    : "This request is closed.");
        }
        return built(r);
    }

    /** The request a Term was built from, if any. */
    @Transactional(readOnly = true)
    Optional<Built> ofTerm(long termId) {
        return jdbc.sql("SELECT * FROM cfg_term_request WHERE term_id = :t AND status <> 'REJECTED'")
                .param("t", termId).query((rs, i) -> row(rs)).optional().map(this::built);
    }

    /** The Admin started the Term's Draft from the request: In progress, linked to the Term. */
    @Transactional(propagation = Propagation.MANDATORY)
    void built(long id, long termId) {
        AuthenticatedUser me = currentUser.get();
        Row r = find(id, true);
        Instant now = Instant.now(clock);
        jdbc.sql("""
                UPDATE cfg_term_request SET status = 'IN_PROGRESS', term_id = :term, updated_at = :now,
                       version = version + 1
                WHERE id = :id
                """)
                .param("term", termId).param("now", Timestamp.from(now)).param("id", id).update();
        event(id, "BUILT", me.userId(), null, now);
        if (r.status().equals("SUBMITTED")) {
            events.publishEvent(new TermRequestDecided(id, r.code(), r.termName(), "IN_PROGRESS", me.name(), null,
                    r.requestedBy()));
        }
    }

    /** The Term built from the request is published: Done. */
    @Transactional(propagation = Propagation.MANDATORY)
    void done(long termId) {
        Optional<Row> r = jdbc.sql("SELECT * FROM cfg_term_request WHERE term_id = :t AND status IN ('SUBMITTED', "
                        + "'IN_PROGRESS', 'NEEDS_CHANGES') FOR UPDATE")
                .param("t", termId).query((rs, i) -> row(rs)).optional();
        if (r.isEmpty()) {
            return;
        }
        Instant now = Instant.now(clock);
        jdbc.sql("UPDATE cfg_term_request SET status = 'DONE', updated_at = :now, version = version + 1 WHERE id = :id")
                .param("now", Timestamp.from(now)).param("id", r.get().id()).update();
        event(r.get().id(), "DONE", currentUser.id(), null, now);
    }

    // ---------------------------------------------------------------- helpers

    private record Clean(String termName, TermPlan.Proposal proposal, String notes) {
    }

    private Clean validate(Body body, Long requestId) {
        if (body == null) {
            throw FieldErrors.single("termName", "Enter the Term name.");
        }
        FieldErrors errors = new FieldErrors();
        String name = body.termName() == null ? "" : body.termName().trim();
        errors.check(!name.isEmpty() && name.length() <= 100, "termName", "Enter the Term name in at most 100 characters.");
        errors.check(body.stayStart() != null, "stayStart", "Enter the first day of the stay.");
        errors.check(body.stayEnd() != null, "stayEnd", "Enter the last day of the stay.");
        if (body.stayStart() != null && body.stayEnd() != null) {
            errors.check(body.stayStart().isBefore(body.stayEnd()), "stayEnd", "The stay must end after it starts.");
        }
        drafts.overlapping(body.stayStart(), body.stayEnd(), null).ifPresent(other ->
                errors.add("stayStart", "The stay dates overlap " + other + ". Published Terms cannot overlap."));
        TermPlan.Timeline timeline = body.timeline() == null ? TermPlan.Timeline.empty() : body.timeline();
        TermTimelines.check(timeline, body.stayStart(), body.stayEnd(),
                drafts.previous(body.stayStart(), null).orElse(null), false, errors);

        Map<String, TermSupply.Block> blocks = new LinkedHashMap<>();
        supply.blocks().forEach(b -> blocks.put(b.code().toUpperCase(Locale.ROOT), b));
        List<String> blockCodes = new ArrayList<>();
        for (String code : body.blocks() == null ? List.<String>of() : body.blocks()) {
            String c = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
            if (!blocks.containsKey(c)) {
                errors.add("blocks", "Block " + code + " does not exist.");
            } else if (!blockCodes.contains(blocks.get(c).code())) {
                blockCodes.add(blocks.get(c).code());
            }
        }
        List<String> rooms = body.excludedRooms() == null ? List.of() : body.excludedRooms().stream()
                .filter(c -> c != null && !c.isBlank()).map(c -> c.trim().toUpperCase(Locale.ROOT)).distinct().toList();
        Map<String, TermSupply.Room> known = supply.roomsByCode(rooms);
        for (String code : rooms) {
            errors.check(known.containsKey(code), "excludedRooms", "Room " + code + " does not exist.");
        }
        Set<Long> types = catalog.roomTypes().stream().filter(Catalog.RoomTypeInfo::active)
                .map(Catalog.RoomTypeInfo::id).collect(Collectors.toSet());
        Set<Long> classes = catalog.roomClasses().stream().filter(Catalog.RoomClassInfo::active)
                .map(Catalog.RoomClassInfo::id).collect(Collectors.toSet());
        List<TermPlan.Places> places = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (TermPlan.Places p : body.places() == null ? List.<TermPlan.Places>of() : body.places()) {
            Long type = id(p.roomTypeId());
            Long roomClass = id(p.roomClassId());
            String gender = p.gender() == null ? "" : p.gender().trim().toUpperCase(Locale.ROOT);
            if (type == null || !types.contains(type) || roomClass == null || !classes.contains(roomClass)) {
                errors.add("places", "Choose an active Room Type and Room Class for each line of places.");
                continue;
            }
            if (!gender.equals("M") && !gender.equals("F")) {
                errors.add("places", "Choose male or female for each line of places.");
                continue;
            }
            if (p.places() == null || p.places() < 0 || p.places() > MAX_PLACES) {
                errors.add("places", "Enter 0 to 100,000 places on each line.");
                continue;
            }
            if (!seen.add(type + ":" + roomClass + ":" + gender)) {
                errors.add("places", "List each Room Type, Room Class and gender once.");
                continue;
            }
            places.add(new TermPlan.Places(String.valueOf(type), String.valueOf(roomClass), gender, p.places()));
        }
        List<TermPlan.Price> prices = new ArrayList<>();
        seen.clear();
        for (TermPlan.Price p : body.prices() == null ? List.<TermPlan.Price>of() : body.prices()) {
            Long type = id(p.roomTypeId());
            Long roomClass = id(p.roomClassId());
            if (type == null || !types.contains(type) || roomClass == null || !classes.contains(roomClass)) {
                errors.add("prices", "Choose an active Room Type and Room Class for each price.");
                continue;
            }
            if (p.price() == null || p.price() <= 0 || p.price() > MAX_PRICE) {
                errors.add("prices", "Enter each price per Bed as a whole amount above 0 VND.");
                continue;
            }
            if (!seen.add(type + ":" + roomClass)) {
                errors.add("prices", "List each Room Type and Room Class once.");
                continue;
            }
            prices.add(new TermPlan.Price(String.valueOf(type), String.valueOf(roomClass), p.price()));
        }
        String notes = body.notes() == null || body.notes().isBlank() ? null : body.notes().trim();
        errors.check(notes == null || notes.length() <= 2000, "notes", "Keep the notes under 2,000 characters.");
        errors.throwIfAny();

        Optional<String> open = jdbc.sql("""
                SELECT code FROM cfg_term_request
                WHERE lower(term_name) = lower(:name) AND status IN ('SUBMITTED', 'IN_PROGRESS', 'NEEDS_CHANGES')
                  AND id <> :id
                """)
                .param("name", name).param("id", requestId == null ? -1L : requestId).query(String.class).optional();
        if (open.isPresent()) {
            throw ApiException.conflict("TERM_REQUEST_OPEN",
                    name + " already has an open request (" + open.get() + "). Comment on it instead.");
        }
        boolean published = jdbc.sql("""
                SELECT count(*) FROM cfg_term WHERE lower(name) = lower(:name) AND status <> 'DRAFT'
                """).param("name", name).query(Long.class).single() > 0;
        if (published) {
            throw ApiException.conflict("TERM_EXISTS", "A Term named " + name + " is already published.");
        }
        return new Clean(name, new TermPlan.Proposal(timeline, blockCodes, rooms, places, prices), notes);
    }

    /** Active users of the role, without {@code except}. */
    private List<Long> others(Role role, long except) {
        return users.activeUserIds(role.name()).stream().filter(u -> u != except).toList();
    }

    private void event(long requestId, String kind, Long actorId, String note, Instant at) {
        jdbc.sql("""
                INSERT INTO cfg_term_request_event (request_id, kind, actor_id, note, at)
                VALUES (:request, :kind, :actor, :note, :at)
                """)
                .param("request", requestId).param("kind", kind).param("actor", actorId).param("note", note)
                .param("at", Timestamp.from(at))
                .update();
    }

    private Row find(long id, boolean lock) {
        return jdbc.sql("SELECT * FROM cfg_term_request WHERE id = :id" + (lock ? " FOR UPDATE" : ""))
                .param("id", id).query((rs, i) -> row(rs)).optional()
                .orElseThrow(() -> ApiException.notFound("This registration-period request does not exist."));
    }

    private Built built(Row r) {
        return new Built(r.id(), r.code(), r.termName(), r.stayStart(), r.stayEnd(), r.requestedBy(), r.status(),
                r.termId(), proposal(r));
    }

    private TermPlan.Proposal proposal(Row r) {
        return json.readValue(r.proposal(), TermPlan.Proposal.class);
    }

    private static Row row(java.sql.ResultSet rs) throws java.sql.SQLException {
        long term = rs.getLong("term_id");
        Long termId = rs.wasNull() ? null : term;
        return new Row(rs.getLong("id"), rs.getString("code"), rs.getString("term_name"),
                rs.getObject("stay_start", LocalDate.class), rs.getObject("stay_end", LocalDate.class),
                rs.getString("proposal"), rs.getString("notes"), rs.getString("status"), rs.getLong("requested_by"),
                termId, rs.getString("decision_note"), rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant());
    }

    /** A status label or code ({@code In progress}, {@code IN_PROGRESS}, {@code Open}) → its code; null when blank. */
    static String statusCode(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String code = value.trim().toUpperCase(Locale.ROOT).replace(' ', '_');
        return code.equals("OPEN") || STATUS.containsKey(code) ? code : "UNKNOWN";
    }

    private static Long id(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.valueOf(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
