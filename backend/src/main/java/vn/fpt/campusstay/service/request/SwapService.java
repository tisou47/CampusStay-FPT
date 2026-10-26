package vn.fpt.campusstay.service.request;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.assignment.Moves;
import vn.fpt.campusstay.service.assignment.Stays;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.setting.UtilityPolicy;
import vn.fpt.campusstay.service.inventory.Buildings;
import vn.fpt.campusstay.event.SwapDecided;
import vn.fpt.campusstay.event.SwapInvited;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.dto.PageQuery;

/**
 * Next-Term Bed swaps (spec §6.10): two continuing residents of the same gender agree to exchange their next-Term
 * Beds, by a direct invitation (student code) or a match on the anonymous swap board of the requests window. The
 * invited student accepts; Staff decide a swap inside their Block, and one across Blocks then goes to a Manager. The
 * two next-Term Allocations exchange Beds; each student pays the next Term's price of the Bed they get, so there is
 * no price difference, charge or credit (spec §8). Swaps are addressed as {@code SW-000012}.
 */
@Service
public class SwapService {

    public record Created(String id) {
    }

    public record MyPost(String block, String roomTypeId, String roomClassId, Instant expiresAt) {
    }

    public record BoardItem(String id, String offeredRoomTypeName, String offeredRoomClassName, int floor, String block,
            String wants, long termPrice, boolean requested, boolean crossBlock) {
    }

    /** @param window the requests window the board belongs to, null without one */
    public record Board(List<String> blocks, MyPost myPost, List<BoardItem> items,
            RoomChangeService.Window window) {
    }

    /** @param termPrice the next Term's price of the Bed (what its holder pays for the next Term) */
    public record Side(String room, String bed, String roomTypeName, String roomClassName, String block, long termPrice) {
    }

    public record Invitation(String id, String status, Instant expiresAt, boolean crossBlock, String termName,
            Side give, Side get) {
    }

    public record Person(String name, String studentCode, String room, String bed, String roomTypeName,
            String roomClassName) {
    }

    public record Check(String label, boolean passed) {
    }

    public record Decision(String by, Instant at, String reason) {
    }

    public record SwapItem(String id, String kind, Instant agreedAt, boolean crossBlock, String status, Person a,
            Person b, List<Check> checks, Decision decision, Instant dueAt) {
    }

    public record SwapPage(List<SwapItem> items, long total, RoomChangeService.Window window) {
    }

    record Swap(long id, long termId, String kind, Long postId, long aAllocationId, long bAllocationId, String status,
            boolean crossBlock, String reason, Instant expiresAt, Instant agreedAt,
            Long decidedBy, Instant decidedAt, String decisionReason, long aBuildingId, long bBuildingId,
            Instant createdAt) {

        String code() {
            return SwapService.code(id);
        }

        boolean open() {
            return status.equals("INVITED") || status.equals("PENDING") || status.equals("TO_MANAGER");
        }
    }

    private record Post(long id, long termId, long allocationId, Long wantedBuildingId, long wantedTypeId,
            long wantedClassId, long buildingId, Instant expiresAt) {
    }

    private static final Map<String, String> STATUSES = Map.of("INVITED", "Invited", "DECLINED", "Declined",
            "EXPIRED", "Expired", "PENDING", "Waiting for Staff", "TO_MANAGER", "To Manager", "APPROVED", "Approved",
            "REJECTED", "Rejected", "CANCELLED", "Cancelled");
    private static final Map<String, String> KINDS = Map.of("DIRECT", "Direct", "BOARD", "Board match");
    private static final String CANNOT_SWAP = "This student cannot swap with you.";

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final Buildings buildings;
    private final TermCatalog terms;
    private final FeePolicy fees;
    private final UtilityPolicy utility;
    private final Parameters parameters;
    private final Moves moves;
    private final Stays stays;
    private final UserDirectory users;
    private final Billing billing;
    private final NextTermContext context;
    private final RoomChangeService roomChanges;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    public SwapService(JdbcClient jdbc, CurrentUser currentUser, BlockScope blockScope, Buildings buildings,
            TermCatalog terms, FeePolicy fees, UtilityPolicy utility, Parameters parameters, Moves moves, Stays stays,
            UserDirectory users, Billing billing, NextTermContext context, RoomChangeService roomChanges,
            ApplicationEventPublisher events, AuditLog audit, Clock clock) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.buildings = buildings;
        this.terms = terms;
        this.fees = fees;
        this.utility = utility;
        this.parameters = parameters;
        this.moves = moves;
        this.stays = stays;
        this.users = users;
        this.billing = billing;
        this.context = context;
        this.roomChanges = roomChanges;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- direct swap

    @Transactional
    public Created direct(String studentCode, String reason) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        NextTermContext.Filing mine = filing(me.userId());
        Moves.Placement other = Optional.ofNullable(studentCode).map(String::trim).filter(c -> !c.isEmpty())
                .flatMap(users::studentByCode)
                .filter(s -> s.userId() != me.userId())
                .flatMap(s -> stays.nextTerm(s.userId(), mine.window().termId()))
                .filter(Stays.NextTerm::continuing)
                .flatMap(n -> moves.placement(n.allocationId()))
                .filter(p -> p.active() && p.gender().equals(mine.placement().gender()))
                .orElseThrow(() -> FieldErrors.single("studentCode", CANNOT_SWAP));
        if (reason != null && reason.length() > 500) {
            throw FieldErrors.single("reason", "Keep the reason under 500 characters.");
        }
        return new Created(invite(me, mine, other, "DIRECT", null,
                reason == null || reason.isBlank() ? null : reason.trim()).code());
    }

    // ---------------------------------------------------------------- swap board

    /** The board of the requests window the student files in (posts of next-Term Beds). */
    @Transactional(readOnly = true)
    public Board board(Long termId) {
        long me = currentUser.require(Role.STUDENT).userId();
        Optional<NextTermContext.Filing> filing = context.of(me)
                .filter(f -> termId == null || f.window().termId() == termId);
        if (filing.isEmpty()) {
            return new Board(List.of(), null, List.of(), null);
        }
        NextTermContext.Filing f = filing.get();
        Moves.Placement p = f.placement();
        Map<Long, String> codes = buildings.activeBlocksFor(p.gender());
        List<Post> posts = jdbc.sql("""
                SELECT * FROM req_swap_post
                WHERE term_id = :term AND status = 'ACTIVE' AND expires_at > :now AND building_id IN (:blocks)
                ORDER BY created_at DESC
                """).param("term", f.window().termId()).param("now", Timestamp.from(Instant.now(clock)))
                .param("blocks", codes.isEmpty() ? List.of(-1L) : List.copyOf(codes.keySet()))
                .query(SwapService::post).list();
        Post own = posts.stream().filter(x -> x.allocationId() == p.allocationId()).findFirst().orElse(null);
        Map<Long, Moves.Placement> owners = moves.placements(posts.stream().map(Post::allocationId).toList());
        Set<Long> requested = Set.copyOf(jdbc.sql("""
                SELECT post_id FROM req_swap WHERE a_allocation_id = :mine AND post_id IS NOT NULL
                  AND status IN ('INVITED', 'PENDING', 'TO_MANAGER')
                """).param("mine", p.allocationId()).query(Long.class).list());
        RoomChangeService.Names names = roomChanges.names();
        List<BoardItem> items = new ArrayList<>();
        for (Post post : posts) {
            Moves.Placement owner = owners.get(post.allocationId());
            if (post.allocationId() == p.allocationId() || owner == null || !owner.active()) {
                continue;
            }
            items.add(new BoardItem(String.valueOf(post.id()), names.type(owner.roomTypeId()),
                    names.roomClass(owner.roomClassId()), owner.floor(), owner.block(),
                    names.type(post.wantedTypeId()) + " · " + names.roomClass(post.wantedClassId()) + " · "
                            + (post.wantedBuildingId() == null ? "any Block" : "Block " + codes.get(post.wantedBuildingId())),
                    price(owner), requested.contains(post.id()), owner.buildingId() != p.buildingId()));
        }
        return new Board(List.copyOf(codes.values()),
                own == null ? null : new MyPost(own.wantedBuildingId() == null ? null : codes.get(own.wantedBuildingId()),
                        String.valueOf(own.wantedTypeId()), String.valueOf(own.wantedClassId()), own.expiresAt()),
                items, RoomChangeService.window(f.window()));
    }

    /** Puts (or replaces) the student's post; without a Room Type the post is taken down. */
    @Transactional
    public void putMyPost(Long termId, String block, Long roomTypeId, Long roomClassId) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        NextTermContext.Filing f = filing(me.userId());
        Moves.Placement p = f.placement();
        Instant now = Instant.now(clock);
        jdbc.sql("UPDATE req_swap_post SET status = 'CLOSED', updated_at = :now WHERE allocation_id = :a AND status = 'ACTIVE'")
                .param("now", Timestamp.from(now)).param("a", p.allocationId()).update();
        if (roomTypeId == null) {
            return;
        }
        if (roomClassId == null || fees.termPrice(p.termId(), roomTypeId, roomClassId).isEmpty()) {
            throw FieldErrors.single("roomClassId", "Choose the Room Type and Room Class you want.");
        }
        Long wanted = null;
        if (block != null && !block.isBlank()) {
            Map<Long, String> codes = buildings.activeBlocksFor(p.gender());
            wanted = codes.entrySet().stream().filter(e -> e.getValue().equalsIgnoreCase(block.trim()))
                    .map(Map.Entry::getKey).findFirst()
                    .orElseThrow(() -> FieldErrors.single("block", "Choose one of the listed Blocks."));
        }
        // A post never outlives the request deadline of its window.
        Instant expires = now.plus(Duration.ofDays(parameters.intValue("swap.post_days")));
        if (expires.isAfter(f.window().closesAt())) {
            expires = f.window().closesAt();
        }
        jdbc.sql("""
                INSERT INTO req_swap_post (term_id, allocation_id, wanted_building_id, wanted_room_type_id,
                                           wanted_room_class_id, building_id, expires_at, created_at, updated_at)
                VALUES (:term, :a, :block, :type, :class, :building, :expires, :now, :now)
                """)
                .param("term", p.termId()).param("a", p.allocationId()).param("block", wanted).param("type", roomTypeId)
                .param("class", roomClassId).param("building", p.buildingId())
                .param("expires", Timestamp.from(expires)).param("now", Timestamp.from(now)).update();
    }

    /** Proposes a swap to the student behind a board post, when the requester's next-Term Bed is what the post wants. */
    @Transactional
    public Created requestPost(String postId) {
        AuthenticatedUser me = currentUser.require(Role.STUDENT);
        Post post = parseId(postId).flatMap(id -> jdbc.sql("""
                SELECT * FROM req_swap_post WHERE id = :id AND status = 'ACTIVE' AND expires_at > :now
                """).param("id", id).param("now", Timestamp.from(Instant.now(clock))).query(SwapService::post).optional())
                .orElseThrow(() -> ApiException.notFound("This post is no longer on the board."));
        NextTermContext.Filing mine = filing(me.userId());
        Moves.Placement my = mine.placement();
        Moves.Placement owner = moves.placement(post.allocationId()).filter(Moves.Placement::active)
                .filter(o -> o.termId() == my.termId() && o.gender().equals(my.gender())
                        && o.allocationId() != my.allocationId())
                .orElseThrow(() -> ApiException.notFound("This post is no longer on the board."));
        if (my.roomTypeId() != post.wantedTypeId() || my.roomClassId() != post.wantedClassId()
                || (post.wantedBuildingId() != null && post.wantedBuildingId() != my.buildingId())) {
            throw ApiException.conflict("NOT_A_MATCH", "Your Bed is not what this student is looking for.");
        }
        return new Created(invite(me, mine, owner, "BOARD", post.id(), null).code());
    }

    // ---------------------------------------------------------------- invitation

    @Transactional(readOnly = true)
    public Invitation invitation(String id) {
        long me = currentUser.require(Role.STUDENT).userId();
        Swap s = find(id, false).orElseThrow(SwapService::notFound);
        Map<Long, Moves.Placement> placed = moves.placements(List.of(s.aAllocationId(), s.bAllocationId()));
        Moves.Placement a = placed.get(s.aAllocationId());
        Moves.Placement b = placed.get(s.bAllocationId());
        boolean viewerIsA = a != null && a.studentId() == me;
        if (!viewerIsA && (b == null || b.studentId() != me)) {
            throw notFound();
        }
        Moves.Placement give = viewerIsA ? a : b;
        Moves.Placement get = viewerIsA ? b : a;
        return new Invitation(s.code(), STATUSES.get(s.status()), s.expiresAt(), s.crossBlock(),
                terms.findPublished(s.termId()).map(TermSummary::name).orElse(null), side(give), side(get));
    }

    /** The invited student accepts (the swap waits for Staff) or declines. */
    @Transactional
    public void respond(String id, Boolean accept) {
        if (accept == null) {
            throw FieldErrors.single("accept", "Accept or decline the swap.");
        }
        long me = currentUser.require(Role.STUDENT).userId();
        Swap s = find(id, true).orElseThrow(SwapService::notFound);
        Map<Long, Moves.Placement> placed = moves.placements(List.of(s.aAllocationId(), s.bAllocationId()));
        Moves.Placement a = placed.get(s.aAllocationId());
        Moves.Placement b = placed.get(s.bAllocationId());
        if (b == null || b.studentId() != me) {
            throw notFound();
        }
        Instant now = Instant.now(clock);
        if (!s.status().equals("INVITED") || !s.expiresAt().isAfter(now)) {
            throw ApiException.conflict("INVITATION_CLOSED", "This swap invitation is no longer open.");
        }
        if (accept && (a == null || !a.active() || !b.active())) {
            throw ApiException.conflict("ALLOCATION_ENDED", "One of you no longer holds the Bed.");
        }
        jdbc.sql("UPDATE req_swap SET status = :status, agreed_at = :at, version = version + 1 WHERE id = :id")
                .param("status", accept ? "PENDING" : "DECLINED").param("at", accept ? Timestamp.from(now) : null)
                .param("id", s.id()).update();
        if (a != null) {
            events.publishEvent(new SwapDecided(s.id(), s.code(), a.studentId(), accept ? "accepted" : "declined"));
        }
    }

    // ---------------------------------------------------------------- Staff and Manager

    /**
     * @param termId the next Term; null = the latest open requests window
     * @param kind   Direct or Board match; {@code status} a status label
     */
    @Transactional(readOnly = true)
    public SwapPage queue(Long termId, String block, String kind, String status, PageQuery page) {
        Set<Long> scope = blockScope.resolve(block).ids();
        long term = roomChanges.queueTerm(termId);
        Map<String, Object> params = new HashMap<>();
        params.put("term", term);
        params.put("scope", List.copyOf(scope));
        StringBuilder where = new StringBuilder(
                " WHERE term_id = :term AND (a_building_id IN (:scope) OR b_building_id IN (:scope))");
        if (kind != null && !kind.isBlank()) {
            where.append(" AND kind = :kind");
            params.put("kind", code(KINDS, kind, "kind", "Choose Direct or Board match."));
        }
        if (status != null && !status.isBlank()) {
            where.append(" AND status = :status");
            params.put("status", code(STATUSES, status, "status", "Choose a valid status."));
        }
        long total = jdbc.sql("SELECT count(*) FROM req_swap" + where).params(params).query(Long.class).single();
        params.put("limit", page.limit());
        params.put("offset", page.offset());
        List<Swap> rows = jdbc.sql("SELECT * FROM req_swap" + where + """
                 ORDER BY (status IN ('PENDING', 'TO_MANAGER')) DESC, coalesce(agreed_at, created_at) DESC, id DESC
                 LIMIT :limit OFFSET :offset
                """).params(params).query(SwapService::swap).list();
        Map<Long, Moves.Placement> placed = moves.placements(rows.stream()
                .flatMap(s -> Stream.of(s.aAllocationId(), s.bAllocationId())).toList());
        Map<Long, UserDirectory.Student> students = users.students(placed.values().stream()
                .map(Moves.Placement::studentId).collect(Collectors.toSet()));
        Map<Long, String> deciders = users.displayNames(rows.stream().map(Swap::decidedBy).filter(Objects::nonNull)
                .collect(Collectors.toSet()));
        RoomChangeService.Names names = roomChanges.names();
        Optional<Stays.Window> window = context.window(term);
        List<SwapItem> items = rows.stream().map(s -> {
            Moves.Placement a = placed.get(s.aAllocationId());
            Moves.Placement b = placed.get(s.bAllocationId());
            return new SwapItem(s.code(), KINDS.get(s.kind()), s.agreedAt(), s.crossBlock(), STATUSES.get(s.status()),
                    person(a, students, names), person(b, students, names), checks(a, b),
                    s.decidedAt() == null ? null : new Decision(deciders.get(s.decidedBy()), s.decidedAt(),
                            s.decisionReason()),
                    window.map(Stays.Window::decisionsDueAt).orElse(null));
        }).toList();
        return new SwapPage(items, total, window.map(RoomChangeService::window).orElse(null));
    }

    /**
     * Staff decide an agreed swap; a swap across Blocks then waits for a Manager, who decides it last. Approval
     * exchanges the two next-Term Beds; nothing is charged or credited.
     */
    @Transactional
    public void decide(String id, String decision, String reason) {
        AuthenticatedUser user = currentUser.require(Permission.DECIDE_ROOM_CHANGES);
        Swap s = find(id, true).orElseThrow(SwapService::notFound);
        Set<Long> scope = blockScope.resolve(null).ids();
        if (!scope.contains(s.aBuildingId()) && !scope.contains(s.bBuildingId())) {
            throw ApiException.forbidden("BLOCK_OUT_OF_SCOPE", "You do not have access to this Block.");
        }
        boolean manager = user.is(Role.MANAGER);
        if (s.status().equals("TO_MANAGER") && !manager) {
            throw ApiException.forbidden("MANAGER_DECIDES", "A swap between Blocks is decided by a Manager.");
        }
        if (!s.status().equals("PENDING") && !s.status().equals("TO_MANAGER")) {
            throw ApiException.conflict("ALREADY_DECIDED", "This swap is not waiting for a decision.");
        }
        Instant now = Instant.now(clock);
        Map<Long, Moves.Placement> placed = moves.placements(List.of(s.aAllocationId(), s.bAllocationId()));
        Moves.Placement a = placed.get(s.aAllocationId());
        Moves.Placement b = placed.get(s.bAllocationId());
        String d = decision == null ? "" : decision.trim();
        if (d.equalsIgnoreCase("rejected")) {
            String why = reason == null || reason.isBlank()
                    ? (manager ? "Rejected by a Manager" : "Rejected by Staff") : reason.trim();
            jdbc.sql("""
                    UPDATE req_swap SET status = 'REJECTED', decided_by = :by, decided_at = :now, decision_reason = :why,
                           version = version + 1
                    WHERE id = :id
                    """).param("by", user.userId()).param("now", Timestamp.from(now)).param("why", why)
                    .param("id", s.id()).update();
            audit.record("SWAP_REJECTED", AuditLog.Tone.WARNING, "Swap", s.id(), s.code(), Map.of("reason", why));
            notifyBoth(s, a, b, "rejected");
            return;
        }
        if (!d.equalsIgnoreCase("approved")) {
            throw FieldErrors.single("decision", "Choose Approved or Rejected.");
        }
        context.checkDeciding(s.termId());
        if (checks(a, b).stream().anyMatch(c -> !c.passed())) {
            throw ApiException.conflict("SWAP_CHECKS_FAILED", "The swap does not pass the rule check any more.");
        }
        if (s.crossBlock() && s.status().equals("PENDING") && !manager) {
            jdbc.sql("""
                    UPDATE req_swap SET status = 'TO_MANAGER', staff_decided_by = :by, staff_decided_at = :now,
                           version = version + 1
                    WHERE id = :id
                    """).param("by", user.userId()).param("now", Timestamp.from(now)).param("id", s.id()).update();
            audit.record("SWAP_TO_MANAGER", AuditLog.Tone.INFO, "Swap", s.id(), s.code(), null);
            return;
        }
        moves.swap(s.aAllocationId(), s.bAllocationId(), user.userId());
        jdbc.sql("""
                UPDATE req_swap SET status = 'APPROVED', decided_by = :by, decided_at = :now, version = version + 1
                WHERE id = :id
                """).param("by", user.userId()).param("now", Timestamp.from(now)).param("id", s.id()).update();
        closeOthers(s, now);
        audit.record("SWAP_APPROVED", AuditLog.Tone.SUCCESS, "Swap", s.id(), s.code(),
                Map.of("a", a.bedCode(), "b", b.bedCode(), "term",
                        terms.findPublished(s.termId()).map(TermSummary::name).orElse("")));
        notifyBoth(s, a, b, "approved");
    }

    /**
     * The two next-Term Beds changed hands: other swaps, board posts and room change requests made from them are
     * closed (their Bed is not that one any more).
     */
    private void closeOthers(Swap s, Instant now) {
        List<Long> both = List.of(s.aAllocationId(), s.bAllocationId());
        jdbc.sql("""
                UPDATE req_swap SET status = 'CANCELLED', decision_reason = 'The next-Term Bed changed.',
                       decided_at = :now, version = version + 1
                WHERE id <> :id AND (a_allocation_id IN (:both) OR b_allocation_id IN (:both))
                  AND status IN ('INVITED', 'PENDING', 'TO_MANAGER')
                """).param("now", Timestamp.from(now)).param("id", s.id()).param("both", both).update();
        jdbc.sql("UPDATE req_swap_post SET status = 'CLOSED', updated_at = :now WHERE allocation_id IN (:both) AND status = 'ACTIVE'")
                .param("now", Timestamp.from(now)).param("both", both).update();
        jdbc.sql("""
                UPDATE req_room_change SET status = 'CANCELLED', decided_at = :now,
                       decision_note = 'Cancelled: the next-Term Bed changed by a swap.', version = version + 1
                WHERE allocation_id IN (:both) AND status IN ('SUBMITTED', 'PENDING')
                """).param("now", Timestamp.from(now)).param("both", both).update();
    }

    // ---------------------------------------------------------------- student's requests screen

    @Transactional(readOnly = true)
    public List<RoomChangeService.StudentItem> ofStudent(long studentId, Long termId) {
        List<Long> mine = moves.allocationsOf(studentId);
        if (mine.isEmpty()) {
            return List.of();
        }
        List<Swap> rows = jdbc.sql("SELECT * FROM req_swap WHERE (a_allocation_id IN (:mine) OR b_allocation_id IN (:mine))"
                + (termId != null ? " AND term_id = :term" : "") + " ORDER BY created_at DESC")
                .params(termId != null ? Map.of("mine", mine, "term", termId) : Map.of("mine", mine))
                .query(SwapService::swap).list();
        Map<Long, Moves.Placement> placed = moves.placements(rows.stream()
                .flatMap(s -> Stream.of(s.aAllocationId(), s.bAllocationId())).toList());
        Map<Long, String> termNames = terms.publishedTerms().stream()
                .collect(Collectors.toMap(TermSummary::id, TermSummary::name));
        Instant now = Instant.now(clock);
        return rows.stream().map(s -> {
            boolean iAmB = mine.contains(s.bAllocationId());
            Moves.Placement other = placed.get(iAmB ? s.aAllocationId() : s.bAllocationId());
            String summary = termNames.getOrDefault(s.termId(), "") + " · Swap with Room "
                    + (other == null ? "?" : other.room() + " · Bed " + other.bed());
            boolean open = iAmB && s.status().equals("INVITED") && s.expiresAt().isAfter(now);
            return new RoomChangeService.StudentItem(s.code(), "Swap", summary, s.createdAt(), STATUSES.get(s.status()),
                    s.decidedAt() == null ? null : new RoomChangeService.StudentDecision(
                            s.decisionReason() != null ? s.decisionReason() : STATUSES.get(s.status()), s.decidedAt()),
                    null, open ? s.code() : null, null);
        }).toList();
    }

    /** Invitations past their time expire; board posts past their time come down. */
    @Transactional
    public int expire() {
        Timestamp now = Timestamp.from(Instant.now(clock));
        int swaps = jdbc.sql("""
                UPDATE req_swap SET status = 'EXPIRED', version = version + 1
                WHERE status = 'INVITED' AND expires_at <= :now
                """).param("now", now).update();
        jdbc.sql("""
                UPDATE req_swap_post SET status = 'CLOSED', updated_at = :now
                WHERE status = 'ACTIVE' AND expires_at <= :now
                """).param("now", now).update();
        return swaps;
    }

    /** Open swaps of the Term (the requests window and its blockers). */
    long openCount(long termId) {
        return jdbc.sql("""
                SELECT count(*) FROM req_swap WHERE term_id = :t AND status IN ('PENDING', 'TO_MANAGER')
                """).param("t", termId).query(Long.class).single();
    }

    /**
     * A next-Term Allocation was cancelled (Assignment's transaction): swaps and posts made from it close, an
     * invitation still waiting for an answer included.
     */
    void allocationCancelled(long allocationId, Instant now) {
        jdbc.sql("""
                UPDATE req_swap SET status = 'CANCELLED', decision_reason = 'The student does not continue next Term.',
                       decided_at = :now, version = version + 1
                WHERE (a_allocation_id = :a OR b_allocation_id = :a) AND status IN ('INVITED', 'PENDING', 'TO_MANAGER')
                """).param("now", Timestamp.from(now)).param("a", allocationId).update();
        jdbc.sql("UPDATE req_swap_post SET status = 'CLOSED', updated_at = :now WHERE allocation_id = :a AND status = 'ACTIVE'")
                .param("now", Timestamp.from(now)).param("a", allocationId).update();
    }

    // ---------------------------------------------------------------- helpers

    /** The student files in an open window and continues next Term (an extension comes first in the last Term). */
    private NextTermContext.Filing filing(long studentId) {
        NextTermContext.Filing f = context.filing(studentId);
        if (!f.nextTerm().continuing()) {
            throw ApiException.conflict("EXTEND_FIRST", "This is the last Term of your stay: ask for an extension first.");
        }
        return f;
    }

    private Swap invite(AuthenticatedUser me, NextTermContext.Filing filing, Moves.Placement other, String kind,
            Long postId, String reason) {
        if (utility.blockChangesWhenOverdue() && billing.hasOverdueInvoice(me.userId())) {
            throw ApiException.conflict("OVERDUE_INVOICE", "Pay your overdue Invoice before you ask for a swap.");
        }
        Moves.Placement mine = filing.placement();
        Instant now = Instant.now(clock);
        Instant expires = now.plus(Duration.ofHours(parameters.intValue("swap.invitation_hours")));
        if (expires.isAfter(filing.window().closesAt())) {
            expires = filing.window().closesAt();
        }
        long id;
        try {
            id = jdbc.sql("""
                    INSERT INTO req_swap (term_id, kind, post_id, a_allocation_id, b_allocation_id, cross_block,
                                          price_difference, reason, expires_at, a_building_id, b_building_id, created_at)
                    VALUES (:term, :kind, :post, :a, :b, :cross, 0, :reason, :expires, :aBlock, :bBlock, :now)
                    RETURNING id
                    """)
                    .param("term", mine.termId()).param("kind", kind).param("post", postId)
                    .param("a", mine.allocationId()).param("b", other.allocationId())
                    .param("cross", mine.buildingId() != other.buildingId()).param("reason", reason)
                    .param("expires", Timestamp.from(expires)).param("aBlock", mine.buildingId())
                    .param("bBlock", other.buildingId()).param("now", Timestamp.from(now))
                    .query(Long.class).single();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("OPEN_SWAP", "You already have a swap waiting. Wait for it or let it expire.");
        }
        events.publishEvent(new SwapInvited(id, code(id), other.studentId(), me.name(), expires));
        return find(String.valueOf(id), false).orElseThrow();
    }

    /** The rule check Staff see: both still hold continuing next-Term Beds and owe nothing overdue. */
    private List<Check> checks(Moves.Placement a, Moves.Placement b) {
        boolean hold = a != null && b != null && a.active() && b.active();
        Map<Long, Stays.NextTerm> next = hold ? stays.nextTerms(List.of(a.allocationId(), b.allocationId())) : Map.of();
        boolean continuing = hold && next.size() == 2 && next.values().stream().allMatch(Stays.NextTerm::continuing);
        boolean noOverdue = a != null && b != null && !billing.hasOverdueInvoice(a.studentId())
                && !billing.hasOverdueInvoice(b.studentId());
        return List.of(new Check("Both students still hold their next-Term Beds", hold),
                new Check("Both students continue next Term", continuing),
                new Check("No overdue Invoice", noOverdue));
    }

    private void notifyBoth(Swap s, Moves.Placement a, Moves.Placement b, String decision) {
        for (Moves.Placement p : new Moves.Placement[] { a, b }) {
            if (p != null) {
                events.publishEvent(new SwapDecided(s.id(), s.code(), p.studentId(), decision));
            }
        }
    }

    private long price(Moves.Placement p) {
        return fees.termPrice(p.termId(), p.roomTypeId(), p.roomClassId()).orElse(0);
    }

    private Side side(Moves.Placement p) {
        if (p == null) {
            return null;
        }
        RoomChangeService.Names names = roomChanges.names();
        return new Side(p.room(), p.bed(), names.type(p.roomTypeId()), names.roomClass(p.roomClassId()),
                "Block " + p.block(), price(p));
    }

    private static Person person(Moves.Placement p, Map<Long, UserDirectory.Student> students,
            RoomChangeService.Names names) {
        if (p == null) {
            return null;
        }
        UserDirectory.Student s = students.get(p.studentId());
        return new Person(s == null ? null : s.name(), s == null ? null : s.studentCode(), p.room(), p.bed(),
                names.type(p.roomTypeId()), names.roomClass(p.roomClassId()));
    }

    private Optional<Swap> find(String id, boolean lock) {
        return parseId(id == null ? null : id.trim().replaceFirst("(?i)^SW-", ""))
                .flatMap(n -> jdbc.sql("SELECT * FROM req_swap WHERE id = :id" + (lock ? " FOR UPDATE" : ""))
                        .param("id", n).query(SwapService::swap).optional());
    }

    private static Optional<Long> parseId(String value) {
        if (value == null || value.isBlank() || value.length() > 18 || !value.chars().allMatch(Character::isDigit)) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(value));
    }

    private static String code(Map<String, String> labels, String value, String field, String message) {
        return labels.entrySet().stream().filter(e -> e.getValue().equalsIgnoreCase(value.trim())
                || e.getKey().equalsIgnoreCase(value.trim().replace(' ', '_'))).map(Map.Entry::getKey).findFirst()
                .orElseThrow(() -> FieldErrors.single(field, message));
    }

    static String code(long id) {
        return "SW-" + String.format(Locale.ROOT, "%06d", id);
    }

    private static ApiException notFound() {
        return ApiException.notFound("This swap does not exist.");
    }

    private static Swap swap(ResultSet rs, int i) throws SQLException {
        return new Swap(rs.getLong("id"), rs.getLong("term_id"), rs.getString("kind"), rs.getObject("post_id", Long.class),
                rs.getLong("a_allocation_id"), rs.getLong("b_allocation_id"), rs.getString("status"),
                rs.getBoolean("cross_block"), rs.getString("reason"),
                instant(rs, "expires_at"), instant(rs, "agreed_at"), rs.getObject("decided_by", Long.class),
                instant(rs, "decided_at"), rs.getString("decision_reason"), rs.getLong("a_building_id"),
                rs.getLong("b_building_id"), instant(rs, "created_at"));
    }

    private static Post post(ResultSet rs, int i) throws SQLException {
        return new Post(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("allocation_id"),
                rs.getObject("wanted_building_id", Long.class), rs.getLong("wanted_room_type_id"),
                rs.getLong("wanted_room_class_id"), rs.getLong("building_id"), instant(rs, "expires_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
