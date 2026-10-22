package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.event.AllocationCreated;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.setting.MatchingCriteria;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.repository.assignment.RunStore;

/**
 * Assignment commands: start a run (dry or final), resolve a conflict, submit a
 * Block for approval (the screen's "commit"), and the Manager's approve or return.
 * Approving commits the Block: Allocations, Balance Invoices and notifications in
 * one transaction. The partial unique index on Allocations is the guard against
 * a Bed taken twice.
 */
@Service
public class AssignmentService {

    public record Started(String id) {
    }

    public record Resolved(String applicationId, String bed, boolean resolved, boolean waitlisted) {
    }

    public record Approved(int allocated, int waitlisted) {
    }

    private static final Set<String> OPEN_RUN = Set.of("PROPOSED", "IN_REVIEW");
    private static final Set<String> EDITABLE_BLOCK = Set.of("REVIEW", "RETURNED");

    private final JdbcClient jdbc;
    private final RunStore runs;
    private final EngineFactory engines;
    private final Applications applications;
    private final Inventory inventory;
    private final Catalog catalog;
    private final MatchingCriteria criteria;
    private final TermCatalog terms;
    private final FeePolicy fees;
    private final Billing billing;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blocks;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Round2Offers round2;
    private final Clock clock;

    public AssignmentService(JdbcClient jdbc, RunStore runs, EngineFactory engines, Applications applications,
            Inventory inventory, Catalog catalog, MatchingCriteria criteria, TermCatalog terms, FeePolicy fees,
            Billing billing, CurrentUser currentUser, BlockScope blockScope, BlockDirectory blocks,
            ApplicationEventPublisher events, AuditLog audit, Round2Offers round2, Clock clock) {
        this.jdbc = jdbc;
        this.runs = runs;
        this.engines = engines;
        this.applications = applications;
        this.inventory = inventory;
        this.catalog = catalog;
        this.criteria = criteria;
        this.terms = terms;
        this.fees = fees;
        this.billing = billing;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blocks = blocks;
        this.events = events;
        this.audit = audit;
        this.round2 = round2;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- start

    /** A final run replaces the proposal in review, unless a Block of it is already committed. */
    @Transactional
    public Started start(Long termId, boolean dryRun) {
        AuthenticatedUser user = currentUser.require(Permission.RUN_ASSIGNMENT);
        if (termId == null) {
            throw FieldErrors.single("termId", "Choose a Term.");
        }
        TermSummary term = terms.findPublished(termId)
                .orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        Instant now = Instant.now(clock);
        if (!dryRun) {
            List<Long> live = jdbc.sql("""
                    SELECT id FROM asg_run WHERE term_id = :term AND kind <> 'DRY_RUN'
                      AND status IN ('RUNNING', 'PROPOSED', 'IN_REVIEW') FOR UPDATE
                    """).param("term", term.id()).query(Long.class).list();
            for (long id : live) {
                if (runs.blocks(id).stream().anyMatch(b -> b.status().equals("COMMITTED"))) {
                    throw ApiException.conflict("RUN_PARTLY_COMMITTED", "Blocks of " + RunStore.code(id)
                            + " are already committed. Finish that run before starting a new one.");
                }
                jdbc.sql("UPDATE asg_run SET status = 'DISCARDED', version = version + 1 WHERE id = :id")
                        .param("id", id).update();
            }
        }
        MatchingCriteria.Snapshot snapshot = criteria.active();
        List<Applications.Candidate> candidates = applications.approved(term.id());
        List<AssignmentEngine.Placement> placements = engines.engine(term.id(), snapshot.id(), null, null)
                .run(engines.applicants(candidates));

        Map<Long, String> genders = new HashMap<>();
        candidates.forEach(c -> genders.put(c.applicationId(), c.gender()));
        Map<String, Long> fallbackBlock = engines.blockForGender();
        int proposed = (int) placements.stream().filter(p -> p.bedId() != null).count();
        int conflicts = (int) placements.stream().filter(p -> p.issue() != null && !"INFO".equals(p.tone())).count();
        BigDecimal average = average(placements.stream().map(AssignmentEngine.Placement::fit).toList());

        long runId = jdbc.sql("""
                INSERT INTO asg_run (term_id, kind, status, stage, matching_snapshot_id, started_by, started_at,
                                     finished_at, input_count, proposed_count, conflict_count, waitlisted_count, average_fit)
                VALUES (:term, :kind, 'PROPOSED', :stage, :snapshot, :by, :now, :now, :input, :proposed, :conflicts, 0,
                        :average)
                RETURNING id
                """)
                .param("term", term.id()).param("kind", dryRun ? "DRY_RUN" : "REAL").param("stage", dryRun ? 3 : 4)
                .param("snapshot", snapshot.id()).param("by", user.userId()).param("now", Timestamp.from(now))
                .param("input", candidates.size()).param("proposed", proposed).param("conflicts", conflicts)
                .param("average", average)
                .query(Long.class).single();
        Set<Long> buildings = new LinkedHashSet<>();
        for (AssignmentEngine.Placement p : placements) {
            Long building = p.buildingId() != null ? p.buildingId() : fallbackBlock.get(genders.get(p.applicationId()));
            if (building != null) {
                buildings.add(building);
            }
            jdbc.sql("""
                    INSERT INTO asg_proposal_item (run_id, application_id, building_id, bed_id, fit, issue_code, issue_tone,
                                                   reason)
                    VALUES (:run, :app, :building, :bed, :fit, :issue, :tone, :reason)
                    """)
                    .param("run", runId).param("app", p.applicationId()).param("building", building)
                    .param("bed", p.bedId()).param("fit", p.fit()).param("issue", p.issue()).param("tone", p.tone())
                    .param("reason", p.reason())
                    .update();
        }
        for (long building : buildings) {
            jdbc.sql("INSERT INTO asg_run_block (run_id, building_id) VALUES (:run, :b)")
                    .param("run", runId).param("b", building).update();
        }
        audit.record(dryRun ? "ASSIGNMENT_DRY_RUN" : "ASSIGNMENT_RUN_STARTED", AuditLog.Tone.INFO, "Assignment run",
                runId, RunStore.code(runId) + " · " + term.name(),
                Map.of("input", candidates.size(), "proposed", proposed, "conflicts", conflicts));
        return new Started(RunStore.code(runId));
    }

    // ---------------------------------------------------------------- resolve one conflict

    /**
     * @param optionKey {@code KEEP}, {@code SOLO}, {@code CLASS:<roomClassId>} or {@code TYPE:<roomTypeId>:<roomClassId>}
     * @param waitlist  true to move the Application to the waitlist instead
     */
    @Transactional
    public Resolved resolve(String runCode, String applicationCode, String optionKey, boolean waitlist) {
        AuthenticatedUser user = currentUser.require(Permission.RUN_ASSIGNMENT);
        RunStore.Run run = editableRun(runCode);
        Applications.Candidate app = applications.find(applicationCode)
                .orElseThrow(() -> ApiException.notFound("This Application is not in the run."));
        RunStore.Item item = runs.item(run.id(), app.applicationId(), true)
                .orElseThrow(() -> ApiException.notFound("This Application is not in the run."));
        if (item.buildingId() != null) {
            blockScope.check(item.buildingId());
            RunStore.Block block = runs.block(run.id(), item.buildingId(), true).orElseThrow();
            if (!EDITABLE_BLOCK.contains(block.status())) {
                throw ApiException.conflict("BLOCK_SUBMITTED", "This Block is with the Manager; it cannot change now.");
            }
        }
        if (waitlist) {
            update(item.id(), null, item.buildingId(), null, "WAITLIST", true, "Moved to the waitlist by " + user.name());
            audit("Waitlisted", run, app);
            recount(run.id());
            return new Resolved(app.code(), null, true, true);
        }
        if (optionKey == null || optionKey.isBlank()) {
            throw FieldErrors.single("optionKey", "Choose how to resolve the conflict.");
        }
        String key = optionKey.trim();
        if (key.equals("KEEP")) {
            if (item.bedId() == null) {
                throw FieldErrors.single("optionKey", "There is no Bed to keep. Choose another option.");
            }
            update(item.id(), item.bedId(), item.buildingId(), item.fit(), key, false, "Kept by " + user.name());
            audit("Kept", run, app);
            return new Resolved(app.code(), bedCode(item.bedId()), true, false);
        }
        long[] kind = kind(key, app);
        AssignmentEngine engine = engines.engine(run.termId(), run.snapshotId(), run.id(), app.applicationId());
        AssignmentEngine.Applicant applicant = engines.applicants(List.of(app)).getFirst();
        AssignmentEngine.Placement placed = engine.placeSingle(applicant, kind[0], kind[1])
                .orElseThrow(() -> ApiException.conflict("NO_BED_LEFT",
                        "No free Bed of that kind is left. Choose another option or the waitlist."));
        if (placed.buildingId() != null && !Objects.equals(placed.buildingId(), item.buildingId())) {
            jdbc.sql("INSERT INTO asg_run_block (run_id, building_id) VALUES (:run, :b) ON CONFLICT DO NOTHING")
                    .param("run", run.id()).param("b", placed.buildingId()).update();
        }
        update(item.id(), placed.bedId(), placed.buildingId(), placed.fit(), key, false,
                "Placed in " + typeName(kind[0]) + " · " + className(kind[1]) + " by " + user.name());
        audit("Placed", run, app);
        recount(run.id());
        return new Resolved(app.code(), bedCode(placed.bedId()), true, false);
    }

    // ---------------------------------------------------------------- submit, approve, return

    /** Staff send a Block's proposal to the Block Manager ("Commit Block" on the screen). */
    @Transactional
    public void submit(String runCode, String blockCode) {
        AuthenticatedUser user = currentUser.require(Permission.RUN_ASSIGNMENT);
        RunStore.Run run = editableRun(runCode);
        long building = building(blockCode);
        RunStore.Block block = runs.block(run.id(), building, true)
                .orElseThrow(() -> ApiException.notFound("Block " + blockCode + " has nothing in this run."));
        if (!EDITABLE_BLOCK.contains(block.status())) {
            throw ApiException.conflict("BLOCK_SUBMITTED", "Block " + blockCode + " was already submitted.");
        }
        long open = runs.items(run.id()).stream()
                .filter(i -> Objects.equals(i.buildingId(), building) && i.blocking()).count();
        if (open > 0) {
            throw ApiException.conflict("CONFLICTS_LEFT", "Resolve the " + open + (open == 1 ? " conflict" : " conflicts")
                    + " in Block " + blockCode + " before you submit it.");
        }
        Timestamp now = Timestamp.from(Instant.now(clock));
        jdbc.sql("""
                UPDATE asg_run_block SET status = 'SUBMITTED', submitted_by = :by, submitted_at = :now, comment = NULL,
                       version = version + 1
                WHERE run_id = :run AND building_id = :b
                """).param("by", user.userId()).param("now", now).param("run", run.id()).param("b", building).update();
        jdbc.sql("UPDATE asg_run SET status = 'IN_REVIEW', version = version + 1 WHERE id = :id AND status = 'PROPOSED'")
                .param("id", run.id()).update();
        audit.record("PROPOSAL_SUBMITTED", AuditLog.Tone.INFO, "Assignment run", run.id(),
                run.code() + " · Block " + blockCode, null);
    }

    /** The Manager approves: Allocations, Balance Invoices and notifications for the Block, all or nothing. */
    @Transactional
    public Approved approve(String runCode, String blockCode) {
        AuthenticatedUser user = currentUser.require(Permission.APPROVE_ASSIGNMENT);
        RunStore.Run run = runs.run(runCode).filter(r -> r.kind().equals("REAL"))
                .orElseThrow(() -> ApiException.notFound("This run does not exist."));
        long building = building(blockCode);
        RunStore.Block block = runs.block(run.id(), building, true)
                .orElseThrow(() -> ApiException.notFound("Block " + blockCode + " has nothing in this run."));
        if (!block.status().equals("SUBMITTED")) {
            throw ApiException.conflict("NOT_SUBMITTED", "Block " + blockCode + " is not waiting for approval.");
        }
        TermSummary term = terms.findPublished(run.termId()).orElseThrow();
        List<RunStore.Item> items = runs.items(run.id()).stream()
                .filter(i -> Objects.equals(i.buildingId(), building)).toList();
        Map<Long, Applications.Candidate> apps = applications.find(items.stream().map(RunStore.Item::applicationId).toList());
        Map<Long, Inventory.BedSlot> beds = inventory.beds(items.stream().map(RunStore.Item::bedId)
                .filter(Objects::nonNull).toList());
        Instant now = Instant.now(clock);
        Instant balanceDueAt = now.plus(Duration.ofDays(fees.balanceDays()));
        int allocated = 0;
        int waitlisted = 0;
        List<Applications.Candidate> toRound2 = new ArrayList<>();
        for (RunStore.Item item : items) {
            Applications.Candidate app = apps.get(item.applicationId());
            if (app == null || !app.status().equals("APPROVED")) {
                continue; // cancelled or changed since the run
            }
            if (item.waitlisted() || item.bedId() == null) {
                applications.waitlisted(app.applicationId(),
                        item.reason() == null ? "No free Bed of the chosen kind" : item.reason());
                if (!"NOT_ELIGIBLE".equals(item.issue())) {
                    toRound2.add(app);
                }
                waitlisted++;
                continue;
            }
            Inventory.BedSlot bed = beds.get(item.bedId());
            long allocationId = jdbc.sql("""
                    INSERT INTO asg_allocation (term_id, application_id, student_id, bed_id, source, run_id, allocated_at,
                                                allocated_by)
                    VALUES (:term, :app, :student, :bed, 'ASSIGNMENT', :run, :now, :by) RETURNING id
                    """)
                    .param("term", run.termId()).param("app", app.applicationId()).param("student", app.studentId())
                    .param("bed", bed.bedId()).param("run", run.id()).param("now", Timestamp.from(now))
                    .param("by", user.userId())
                    .query(Long.class).single();
            applications.allocated(app.applicationId(), bed.roomCode(), bed.bedLabel());
            long price = bed.roomTypeId() == app.roomTypeId() && bed.roomClassId() == app.roomClassId()
                    ? app.termPrice()
                    : fees.termPrice(bed.roomTypeId(), bed.roomClassId()).orElse(app.termPrice());
            Optional<Billing.IssuedInvoice> balance = billing.issueBalance(new Billing.BalanceRequest(run.termId(),
                    app.studentId(), app.applicationId(), app.code(), allocationId, bed.buildingId(), bed.roomCode(),
                    price, app.depositAmount(), balanceDueAt));
            events.publishEvent(new AllocationCreated(allocationId, app.studentId(), term.name(), bed.roomCode(),
                    bed.bedLabel(), balance.map(Billing.IssuedInvoice::dueAt).orElse(null)));
            allocated++;
        }
        round2.offer(run.termId(), toRound2);
        Timestamp at = Timestamp.from(now);
        jdbc.sql("""
                UPDATE asg_run_block SET status = 'COMMITTED', decided_by = :by, decided_at = :now, committed_at = :now,
                       version = version + 1
                WHERE run_id = :run AND building_id = :b
                """).param("by", user.userId()).param("now", at).param("run", run.id()).param("b", building).update();
        boolean all = runs.blocks(run.id()).stream().allMatch(b -> b.status().equals("COMMITTED"));
        if (all) {
            jdbc.sql("UPDATE asg_run SET status = 'COMMITTED', stage = 5, version = version + 1 WHERE id = :id")
                    .param("id", run.id()).update();
        }
        audit.record("PROPOSAL_APPROVED", AuditLog.Tone.SUCCESS, "Assignment run", run.id(),
                run.code() + " · Block " + blockCode, Map.of("allocated", allocated, "waitlisted", waitlisted));
        return new Approved(allocated, waitlisted);
    }

    @Transactional
    public void returnToStaff(String runCode, String blockCode, String comment) {
        AuthenticatedUser user = currentUser.require(Permission.APPROVE_ASSIGNMENT);
        if (comment == null || comment.isBlank()) {
            throw FieldErrors.single("comment", "Tell Staff what to change.");
        }
        RunStore.Run run = runs.run(runCode).filter(r -> r.kind().equals("REAL"))
                .orElseThrow(() -> ApiException.notFound("This run does not exist."));
        long building = building(blockCode);
        RunStore.Block block = runs.block(run.id(), building, true)
                .orElseThrow(() -> ApiException.notFound("Block " + blockCode + " has nothing in this run."));
        if (!block.status().equals("SUBMITTED")) {
            throw ApiException.conflict("NOT_SUBMITTED", "Block " + blockCode + " is not waiting for approval.");
        }
        jdbc.sql("""
                UPDATE asg_run_block SET status = 'RETURNED', decided_by = :by, decided_at = :now, comment = :comment,
                       version = version + 1
                WHERE run_id = :run AND building_id = :b
                """).param("by", user.userId()).param("now", Timestamp.from(Instant.now(clock)))
                .param("comment", comment.trim()).param("run", run.id()).param("b", building).update();
        audit.record("PROPOSAL_RETURNED", AuditLog.Tone.WARNING, "Assignment run", run.id(),
                run.code() + " · Block " + blockCode, Map.of("comment", comment.trim()));
    }

    // ---------------------------------------------------------------- helpers

    private RunStore.Run editableRun(String runCode) {
        RunStore.Run run = runs.run(runCode).orElseThrow(() -> ApiException.notFound("This run does not exist."));
        if (run.kind().equals("DRY_RUN")) {
            throw ApiException.conflict("DRY_RUN", "A dry run is a preview: it cannot be changed or submitted.");
        }
        if (!OPEN_RUN.contains(run.status())) {
            throw ApiException.conflict("RUN_CLOSED", "This run is " + RunStore.statusLabel(run.status()).toLowerCase(Locale.ROOT)
                    + " and cannot change.");
        }
        return run;
    }

    private long building(String blockCode) {
        if (blockCode == null || blockCode.isBlank()) {
            throw FieldErrors.single("block", "Choose a Block.");
        }
        long id = blocks.findIdByCode(blockCode.trim())
                .orElseThrow(() -> ApiException.notFound("Block " + blockCode.trim() + " does not exist."));
        blockScope.check(id);
        return id;
    }

    /** {@code CLASS:3} → same Room Type, Class 3; {@code TYPE:2:3}; {@code SOLO} → the Application's own kind. */
    private static long[] kind(String key, Applications.Candidate app) {
        String[] parts = key.split(":");
        try {
            return switch (parts[0]) {
                case "SOLO" -> new long[] { app.roomTypeId(), app.roomClassId() };
                case "CLASS" -> new long[] { app.roomTypeId(), Long.parseLong(parts[1]) };
                case "TYPE" -> new long[] { Long.parseLong(parts[1]), Long.parseLong(parts[2]) };
                default -> throw FieldErrors.single("optionKey", "Choose one of the listed options.");
            };
        } catch (ArrayIndexOutOfBoundsException | NumberFormatException e) {
            throw FieldErrors.single("optionKey", "Choose one of the listed options.");
        }
    }

    private void update(long itemId, Long bedId, Long buildingId, BigDecimal fit, String key, boolean waitlisted,
            String reason) {
        jdbc.sql("""
                UPDATE asg_proposal_item SET bed_id = :bed, building_id = :building, fit = :fit, resolved = TRUE,
                       resolution_key = :key, waitlisted = :waitlisted, reason = :reason
                WHERE id = :id
                """)
                .param("bed", bedId).param("building", buildingId).param("fit", fit).param("key", key)
                .param("waitlisted", waitlisted).param("reason", reason).param("id", itemId).update();
    }

    private void recount(long runId) {
        jdbc.sql("""
                UPDATE asg_run SET proposed_count = (SELECT count(*) FROM asg_proposal_item WHERE run_id = :id AND bed_id IS NOT NULL),
                       waitlisted_count = (SELECT count(*) FROM asg_proposal_item WHERE run_id = :id AND waitlisted),
                       average_fit = (SELECT avg(fit) FROM asg_proposal_item WHERE run_id = :id AND fit IS NOT NULL),
                       version = version + 1
                WHERE id = :id
                """).param("id", runId).update();
    }

    private void audit(String what, RunStore.Run run, Applications.Candidate app) {
        audit.record("PROPOSAL_CONFLICT_RESOLVED", AuditLog.Tone.INFO, "Application", app.applicationId(), app.code(),
                Map.of("run", run.code(), "resolution", what));
    }

    private String bedCode(Long bedId) {
        return bedId == null ? null : inventory.beds(List.of(bedId)).values().stream()
                .map(Inventory.BedSlot::code).findFirst().orElse(null);
    }

    private String typeName(long id) {
        return catalog.roomTypes().stream().filter(t -> t.id() == id).map(Catalog.RoomTypeInfo::name).findFirst()
                .orElse("Room Type");
    }

    private String className(long id) {
        return catalog.roomClasses().stream().filter(c -> c.id() == id).map(Catalog.RoomClassInfo::name).findFirst()
                .orElse("Room Class");
    }

    static BigDecimal average(List<BigDecimal> fits) {
        List<BigDecimal> known = fits.stream().filter(Objects::nonNull).toList();
        if (known.isEmpty()) {
            return null;
        }
        return known.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(known.size()), 4, RoundingMode.HALF_UP);
    }
}
