package vn.fpt.campusstay.service.assignment;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.service.auth.BlockDirectory;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.setting.Catalog;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.setting.MatchingCriteria;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.repository.assignment.RunStore;

/** Read side of assignment: runs, the proposal per Block, conflict options, Rooms and the Manager's approval. */
@Service
public class AssignmentQueries {

    public record RunSummary(String id, String kind, String status, String statusTone, int stage, Instant startedAt,
            Instant finishedAt, String startedBy, String snapshot, int input, int proposed, long conflicts,
            int waitlisted, Integer averageFit) {
    }

    public record RunRow(String id, String kind, Instant startedAt, String startedBy, int proposed, long conflicts,
            int waitlisted, String status) {
    }

    public record RuleGroup(String title, List<String> items) {
    }

    public record Rules(String snapshot, List<RuleGroup> groups) {
    }

    public record Overview(RunSummary current, List<RunRow> history, Rules rules) {
    }

    /** {@code status}: review, submitted or approved. */
    public record BlockTab(String block, long total, long conflicts, String status) {
    }

    public record Issue(String label, String tone) {
    }

    public record ProposalItem(String applicationId, String studentName, String studentCode, boolean pair,
            String preference, String bed, Integer fit, Issue issue, boolean resolved, String reason) {
    }

    public record CommitSummary(long students, Instant balanceDueAt) {
    }

    /** {@code editable}: false for a dry run and a run that is committed, discarded or failed (read only). */
    public record Proposal(RunSummary run, boolean editable, List<BlockTab> blocks, long waitlistedCount, List<ProposalItem> items, long total,
            CommitSummary commitSummary) {
    }

    public record IssueDetail(String label, String title, String detail, String tone) {
    }

    public record Option(String key, String label, String detail, boolean recommended) {
    }

    public record Conflict(String applicationId, String studentName, String preference, String bed, IssueDetail issue,
            List<Option> options) {
    }

    public record Flag(String label, String tone) {
    }

    public record RoomRow(String room, String roomTypeName, String roomClassName, String students, String note,
            BigDecimal score, Flag flag) {
    }

    public record RoomPage(List<RoomRow> items, long total) {
    }

    /** {@code status}: Waiting, Approved or Returned. */
    public record ApprovalItem(String runId, String block, String blockLabel, String termName, String submittedBy,
            Instant submittedAt, long bedsOffered, long conflictsResolved, long conflictsTotal, long applications,
            long allocated, long toRound2, BigDecimal averageScore, String status, String comment) {
    }

    public record Approval(ApprovalItem item) {
    }

    private static final Set<String> OPEN_RUN = Set.of("PROPOSED", "IN_REVIEW");

    private static final Map<String, String> ISSUE_TITLES = Map.of("NO_BED", "No free Bed of the chosen kind",
            "PARTNER_NOT_READY", "The invited roommate is not ready", "NOT_ELIGIBLE", "No longer eligible", "LOW_FIT",
            "Low Room fit");

    private final JdbcClient jdbc;
    private final RunStore runs;
    private final EngineFactory engines;
    private final Applications applications;
    private final Inventory inventory;
    private final Catalog catalog;
    private final MatchingCriteria criteria;
    private final FeePolicy fees;
    private final TermCatalog terms;
    private final UserDirectory users;
    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final BlockDirectory blocks;
    private final Clock clock;

    public AssignmentQueries(JdbcClient jdbc, RunStore runs, EngineFactory engines, Applications applications,
            Inventory inventory, Catalog catalog, MatchingCriteria criteria, FeePolicy fees, TermCatalog terms,
            UserDirectory users, CurrentUser currentUser, BlockScope blockScope, BlockDirectory blocks, Clock clock) {
        this.jdbc = jdbc;
        this.runs = runs;
        this.engines = engines;
        this.applications = applications;
        this.inventory = inventory;
        this.catalog = catalog;
        this.criteria = criteria;
        this.fees = fees;
        this.terms = terms;
        this.users = users;
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.blocks = blocks;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- runs

    @Transactional(readOnly = true)
    public Overview overview(Long termId, String block) {
        blockScope.resolve(block);
        TermSummary term = term(termId);
        List<RunStore.Run> all = runs.runs(term.id());
        Map<Long, String> names = users.displayNames(all.stream().map(RunStore.Run::startedBy).toList());
        Map<Long, MatchingCriteria.Snapshot> snapshots = new LinkedHashMap<>();
        List<RunRow> history = all.stream()
                .map(r -> new RunRow(r.code(), RunStore.kindLabel(r.kind()), r.startedAt(), names.get(r.startedBy()),
                        r.proposed(), conflicts(r.id()), r.waitlisted(), RunStore.statusLabel(r.status())))
                .toList();
        RunSummary current = all.isEmpty() ? null : summary(all.getFirst(), names, snapshots);
        MatchingCriteria.Snapshot snapshot = all.isEmpty() ? criteria.forTerm(term.id()) : snapshot(all.getFirst(), snapshots);
        return new Overview(current, history, rules(snapshot));
    }

    private RunSummary summary(RunStore.Run r, Map<Long, String> names, Map<Long, MatchingCriteria.Snapshot> cache) {
        String tone = switch (r.status()) {
            case "COMMITTED" -> "success";
            case "FAILED" -> "error";
            case "DISCARDED" -> "neutral";
            case "IN_REVIEW" -> "warning";
            default -> "info";
        };
        return new RunSummary(r.code(), RunStore.kindLabel(r.kind()), RunStore.statusLabel(r.status()), tone, r.stage(),
                r.startedAt(), r.finishedAt(), names.get(r.startedBy()), snapshot(r, cache).label(), r.input(),
                r.proposed(), conflicts(r.id()), r.waitlisted(), RunStore.percent(r.averageFit()));
    }

    private MatchingCriteria.Snapshot snapshot(RunStore.Run r, Map<Long, MatchingCriteria.Snapshot> cache) {
        return cache.computeIfAbsent(r.snapshotId(), id -> criteria.byId(id).orElseGet(criteria::active));
    }

    private static Rules rules(MatchingCriteria.Snapshot s) {
        return new Rules(s.label(), List.of(
                new RuleGroup("Hard constraints", s.hardConstraints()),
                new RuleGroup("Processing order", s.order().stream().map(MatchingCriteria.Criterion::title).toList()),
                new RuleGroup("Roommate matching", s.weights().stream()
                        .map(w -> w.label() + " · " + w.value().movePointRight(2).setScale(0, RoundingMode.HALF_UP) + "%")
                        .toList())));
    }

    private long conflicts(long runId) {
        return runs.items(runId).stream().filter(RunStore.Item::blocking).count();
    }

    // ---------------------------------------------------------------- proposal

    /**
     * @param block a Block code, {@code waitlisted}, or blank for the first Block in scope
     * @param view  {@code conflicts}, {@code proposed} or {@code all} (default)
     */
    @Transactional(readOnly = true)
    public Proposal proposal(String runCode, String block, String view, String q, PageQuery page) {
        RunStore.Run run = runs.run(runCode).orElseThrow(() -> ApiException.notFound("This run does not exist."));
        Set<Long> scope = blockScope.resolve(null).ids();
        List<RunStore.Item> items = runs.items(run.id()).stream()
                .filter(i -> i.buildingId() != null && scope.contains(i.buildingId())).toList();
        Map<Long, String> codes = blocks.codesByIds(scope);
        List<BlockTab> tabs = new ArrayList<>();
        for (RunStore.Block b : runs.blocks(run.id())) {
            if (!scope.contains(b.buildingId())) {
                continue;
            }
            List<RunStore.Item> in = items.stream().filter(i -> i.buildingId() == b.buildingId() && !i.waitlisted())
                    .toList();
            tabs.add(new BlockTab(codes.get(b.buildingId()), in.size(), in.stream().filter(RunStore.Item::blocking).count(),
                    switch (b.status()) {
                        case "SUBMITTED" -> "submitted";
                        case "APPROVED", "COMMITTED" -> "approved";
                        default -> "review";
                    }));
        }
        tabs.sort(Comparator.comparing(BlockTab::block));
        long waitlisted = items.stream().filter(RunStore.Item::waitlisted).count();

        List<RunStore.Item> shown;
        Long selected = null;
        if ("waitlisted".equalsIgnoreCase(block == null ? "" : block.trim())) {
            shown = items.stream().filter(RunStore.Item::waitlisted).toList();
        } else {
            if (block != null && !block.isBlank()) {
                selected = blocks.findIdByCode(block.trim())
                        .orElseThrow(() -> ApiException.notFound("Block " + block.trim() + " does not exist."));
                blockScope.check(selected);
            } else if (!tabs.isEmpty()) {
                selected = blocks.findIdByCode(tabs.getFirst().block()).orElseThrow();
            }
            Long chosen = selected;
            shown = items.stream().filter(i -> Objects.equals(i.buildingId(), chosen) && !i.waitlisted())
                    .filter(i -> switch (view == null ? "all" : view) {
                        case "conflicts" -> i.blocking();
                        case "proposed" -> i.bedId() != null;
                        default -> true;
                    })
                    .toList();
        }
        Map<Long, Applications.Candidate> apps = applications.find(shown.stream().map(RunStore.Item::applicationId)
                .toList());
        if (q != null && !q.isBlank()) {
            String needle = q.trim().toLowerCase(Locale.ROOT);
            shown = shown.stream().filter(i -> {
                Applications.Candidate c = apps.get(i.applicationId());
                return c != null && (c.studentName().toLowerCase(Locale.ROOT).contains(needle)
                        || c.studentCode().toLowerCase(Locale.ROOT).contains(needle)
                        || c.code().toLowerCase(Locale.ROOT).contains(needle));
            }).toList();
        }
        List<RunStore.Item> pageItems = shown.stream().skip(page.offset()).limit(page.limit()).toList();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(run.termId(), pageItems.stream().map(RunStore.Item::bedId)
                .filter(Objects::nonNull).toList());
        Map<Long, String> typeNames = typeNames();
        Map<Long, String> classNames = classNames();
        List<ProposalItem> rows = pageItems.stream().map(i -> {
            Applications.Candidate c = apps.get(i.applicationId());
            Inventory.BedSlot bed = i.bedId() == null ? null : beds.get(i.bedId());
            return new ProposalItem(c.code(), c.studentName(), c.studentCode(), c.partnerApplicationId() != null,
                    typeNames.get(c.roomTypeId()) + " · " + classNames.get(c.roomClassId()), bed == null ? null : bed.code(),
                    RunStore.percent(i.fit()),
                    i.issue() == null ? null : new Issue(RunStore.issueLabel(i.issue()), RunStore.tone(i.tone())),
                    i.resolved(), i.reason());
        }).toList();
        Long chosen = selected;
        long students = items.stream()
                .filter(i -> Objects.equals(i.buildingId(), chosen) && i.bedId() != null && !i.waitlisted()).count();
        Map<Long, String> names = users.displayNames(List.of(run.startedBy()));
        boolean editable = !run.kind().equals("DRY_RUN") && OPEN_RUN.contains(run.status());
        return new Proposal(summary(run, names, new LinkedHashMap<>()), editable, tabs, waitlisted,
                rows, shown.size(), new CommitSummary(students, Instant.now(clock).plus(Duration.ofDays(fees.balanceDays()))));
    }

    // ---------------------------------------------------------------- one conflict

    @Transactional(readOnly = true)
    public Conflict conflict(String runCode, String applicationCode) {
        blockScope.resolve(null);
        RunStore.Run run = runs.run(runCode).orElseThrow(() -> ApiException.notFound("This run does not exist."));
        Applications.Candidate app = applications.find(applicationCode)
                .orElseThrow(() -> ApiException.notFound("This Application is not in the run."));
        RunStore.Item item = runs.item(run.id(), app.applicationId(), false)
                .orElseThrow(() -> ApiException.notFound("This Application is not in the run."));
        if (item.buildingId() != null) {
            blockScope.check(item.buildingId());
        }
        Map<Long, String> typeNames = typeNames();
        Map<Long, String> classNames = classNames();
        String bed = item.bedId() == null ? null : inventory.beds(List.of(item.bedId())).values().stream()
                .map(Inventory.BedSlot::code).findFirst().orElse(null);
        List<Option> options = new ArrayList<>();
        if (item.issue() != null && !run.kind().equals("DRY_RUN")) {
            AssignmentEngine engine = engines.engine(run.termId(), run.snapshotId(), run.id(), app.applicationId());
            switch (item.issue()) {
                case "NO_BED" -> {
                    for (Catalog.RoomClassInfo c : catalog.roomClasses()) {
                        if (c.active() && c.id() != app.roomClassId()) {
                            alternative(engine, app, app.roomTypeId(), c.id(), typeNames, classNames)
                                    .ifPresent(o -> options.add(new Option("CLASS:" + c.id(), o.label(), o.detail(), false)));
                        }
                    }
                    for (Catalog.RoomTypeInfo t : catalog.roomTypes()) {
                        if (t.active() && t.id() != app.roomTypeId()) {
                            alternative(engine, app, t.id(), app.roomClassId(), typeNames, classNames)
                                    .ifPresent(o -> options.add(new Option("TYPE:" + t.id() + ":" + app.roomClassId(),
                                            o.label(), o.detail(), false)));
                        }
                    }
                }
                case "PARTNER_NOT_READY" -> alternative(engine, app, app.roomTypeId(), app.roomClassId(),
                        typeNames, classNames)
                        .ifPresent(o -> options.add(new Option("SOLO", "Place alone · " + o.label(), o.detail(), false)));
                case "LOW_FIT" -> options.add(new Option("KEEP", "Keep Bed " + bed, "The fit is shown for information.",
                        false));
                default -> {
                }
            }
            if (!options.isEmpty()) {
                Option first = options.getFirst();
                options.set(0, new Option(first.key(), first.label(), first.detail(), true));
            }
        }
        return new Conflict(app.code(), app.studentName(),
                typeNames.get(app.roomTypeId()) + " · " + classNames.get(app.roomClassId()), bed,
                item.issue() == null ? null
                        : new IssueDetail(RunStore.issueLabel(item.issue()), ISSUE_TITLES.get(item.issue()), item.reason(),
                                RunStore.tone(item.tone())),
                options);
    }

    private Optional<Option> alternative(AssignmentEngine engine, Applications.Candidate app, long typeId,
            long classId, Map<Long, String> typeNames, Map<Long, String> classNames) {
        int free = engine.freeBeds(app.gender(), typeId, classId);
        if (free == 0) {
            return Optional.empty();
        }
        long price = fees.termPrice(app.termId(), typeId, classId).orElse(0);
        long diff = price - app.termPrice();
        NumberFormat vnd = NumberFormat.getIntegerInstance(Locale.US);
        String detail = free + (free == 1 ? " free Bed" : " free Beds") + " · Term price " + vnd.format(price) + " VND"
                + (diff == 0 ? "" : " (" + (diff > 0 ? "+" : "−") + vnd.format(Math.abs(diff)) + ")");
        return Optional.of(new Option("", typeNames.get(typeId) + " · " + classNames.get(classId), detail, false));
    }

    // ---------------------------------------------------------------- Rooms of a Block (Manager)

    @Transactional(readOnly = true)
    public RoomPage rooms(String runCode, String block, PageQuery page) {
        RunStore.Run run = runs.run(runCode).orElseThrow(() -> ApiException.notFound("This run does not exist."));
        long building = buildingInScope(block);
        List<RunStore.Item> items = runs.items(run.id()).stream()
                .filter(i -> Objects.equals(i.buildingId(), building) && i.bedId() != null && !i.waitlisted()).toList();
        Map<Long, Inventory.BedSlot> beds = inventory.beds(run.termId(), items.stream().map(RunStore.Item::bedId).toList());
        Map<Long, Applications.Candidate> apps = applications.find(items.stream().map(RunStore.Item::applicationId)
                .toList());
        Map<Long, List<RunStore.Item>> byRoom = items.stream()
                .collect(Collectors.groupingBy(i -> beds.get(i.bedId()).roomId(), LinkedHashMap::new, Collectors.toList()));
        Map<Long, Inventory.BedSlot> livingBeds = inventory.beds(run.termId(), heldOutsideRun(run));
        Map<Long, String> typeNames = typeNames();
        Map<Long, String> classNames = classNames();
        List<RoomRow> rows = new ArrayList<>();
        byRoom.entrySet().stream()
                .sorted(Comparator.comparing(e -> beds.get(e.getValue().getFirst().bedId()).roomCode()))
                .forEach(e -> {
                    Inventory.BedSlot first = beds.get(e.getValue().getFirst().bedId());
                    int capacity = inventory.bedsOfRoom(first.roomId()).size();
                    long already = livingBeds.values().stream().filter(b -> b.roomId() == first.roomId()).count();
                    String names = e.getValue().stream().map(i -> apps.get(i.applicationId()))
                            .filter(Objects::nonNull).map(Applications.Candidate::studentName)
                            .collect(Collectors.joining(", "));
                    String note = (e.getValue().size() + already) + " of " + capacity + " Beds"
                            + (already > 0 ? " · " + already + " already living here" : "");
                    BigDecimal score = AssignmentService.average(e.getValue().stream().map(RunStore.Item::fit).toList());
                    boolean low = e.getValue().stream().anyMatch(i -> "LOW_FIT".equals(i.issue()));
                    rows.add(new RoomRow(first.roomCode(), typeNames.get(first.roomTypeId()),
                            classNames.get(first.roomClassId()), names, note,
                            score == null ? null : score.setScale(2, RoundingMode.HALF_UP),
                            low ? new Flag("Low fit", "warning") : null));
                });
        return new RoomPage(rows.stream().skip(page.offset()).limit(page.limit()).toList(), rows.size());
    }

    // ---------------------------------------------------------------- Manager approval

    /** The Block proposal waiting for the Manager (or the last one decided) in the Term's latest final run. */
    @Transactional(readOnly = true)
    public Approval approval(Long termId, String block) {
        currentUser.require(Role.MANAGER, Role.ADMIN);
        Set<Long> scope = blockScope.resolve(block).ids();
        TermSummary term = term(termId);
        RunStore.Run run = runs.runs(term.id()).stream()
                .filter(r -> r.kind().equals("REAL") && !r.status().equals("DISCARDED")).findFirst().orElse(null);
        if (run == null) {
            return new Approval(null);
        }
        RunStore.Block chosen = runs.blocks(run.id()).stream()
                .filter(b -> scope.contains(b.buildingId()) && !b.status().equals("REVIEW"))
                .min(Comparator.comparing((RunStore.Block b) -> !b.status().equals("SUBMITTED"))
                        .thenComparing(RunStore.Block::buildingId))
                .orElse(null);
        if (chosen == null) {
            return new Approval(null);
        }
        String code = blocks.codesByIds(List.of(chosen.buildingId())).get(chosen.buildingId());
        List<RunStore.Item> items = runs.items(run.id()).stream()
                .filter(i -> Objects.equals(i.buildingId(), chosen.buildingId())).toList();
        long conflictsTotal = items.stream().filter(i -> i.issue() != null && !"INFO".equals(i.tone())).count();
        long conflictsResolved = items.stream().filter(i -> i.issue() != null && !"INFO".equals(i.tone()) && i.resolved())
                .count();
        long allocated = items.stream().filter(i -> i.bedId() != null && !i.waitlisted()).count();
        long toRound2 = items.stream().filter(i -> i.waitlisted() || i.bedId() == null).count();
        Set<Long> held = heldOutsideRun(run);
        long bedsOffered = inventory.assignableBeds(run.termId()).stream()
                .filter(b -> b.buildingId() == chosen.buildingId() && !held.contains(b.bedId())).count();
        BigDecimal score = AssignmentService.average(items.stream().map(RunStore.Item::fit).toList());
        String submittedBy = chosen.submittedBy() == null ? null
                : users.displayNames(List.of(chosen.submittedBy())).get(chosen.submittedBy());
        return new Approval(new ApprovalItem(run.code(), code, "Block " + code, term.name(), submittedBy,
                chosen.submittedAt(), Math.max(0, bedsOffered), conflictsResolved, conflictsTotal, items.size(),
                allocated, toRound2, score == null ? null : score.setScale(2, RoundingMode.HALF_UP),
                switch (chosen.status()) {
                    case "SUBMITTED" -> "Waiting";
                    case "RETURNED" -> "Returned";
                    default -> "Approved";
                }, chosen.comment()));
    }

    // ---------------------------------------------------------------- helpers

    /** Beds held in the run's Term by Allocations that this run did not create. */
    private Set<Long> heldOutsideRun(RunStore.Run run) {
        return Set.copyOf(jdbc.sql("""
                SELECT bed_id FROM asg_allocation WHERE term_id = :term AND status = 'ACTIVE'
                  AND (run_id IS NULL OR run_id <> :run)
                """).param("term", run.termId()).param("run", run.id()).query(Long.class).list());
    }

    private long buildingInScope(String block) {
        if (block == null || block.isBlank()) {
            return blockScope.resolve(null).ids().iterator().next();
        }
        long id = blocks.findIdByCode(block.trim())
                .orElseThrow(() -> ApiException.notFound("Block " + block.trim() + " does not exist."));
        blockScope.check(id);
        return id;
    }

    private TermSummary term(Long termId) {
        if (termId != null) {
            return terms.findPublished(termId).orElseThrow(() -> ApiException.notFound("This Term does not exist."));
        }
        return terms.openForRegistration()
                .or(() -> terms.publishedTerms().stream().filter(TermSummary::current).findFirst())
                .orElseThrow(() -> ApiException.notFound("No Term is published yet."));
    }

    private Map<Long, String> typeNames() {
        return catalog.roomTypes().stream().collect(Collectors.toMap(Catalog.RoomTypeInfo::id, Catalog.RoomTypeInfo::name));
    }

    private Map<Long, String> classNames() {
        return catalog.roomClasses().stream()
                .collect(Collectors.toMap(Catalog.RoomClassInfo::id, Catalog.RoomClassInfo::name));
    }
}
