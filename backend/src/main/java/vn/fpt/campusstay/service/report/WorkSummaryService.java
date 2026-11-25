package vn.fpt.campusstay.service.report;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.job.ScheduledJobs;
import vn.fpt.campusstay.common.work.WorkSource;
import vn.fpt.campusstay.common.work.WorkSource.WorkItem;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.BlockScope;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;

/**
 * The work waiting for the user (owner decision 25/11/2026): every feature counts its own open items in the user's
 * Blocks ({@link WorkSource}); the web shows the counts on the menu and the list on the first screen, most urgent
 * first.
 */
@Service
public class WorkSummaryService {

    /** The kinds of work waiting, overdue first, then due soon, then the oldest. */
    public record Summary(Instant at, List<WorkItem> items) {
    }

    private static final Comparator<WorkItem> URGENCY = Comparator.comparingLong(WorkItem::overdue).reversed()
            .thenComparing(Comparator.comparingLong(WorkItem::dueSoon).reversed())
            .thenComparing(WorkItem::oldestAt, Comparator.nullsLast(Comparator.naturalOrder()));

    private final CurrentUser currentUser;
    private final BlockScope blockScope;
    private final List<WorkSource> sources;
    private final ScheduledJobs jobs;
    private final Clock clock;

    public WorkSummaryService(CurrentUser currentUser, BlockScope blockScope, List<WorkSource> sources,
            ScheduledJobs jobs, Clock clock) {
        this.currentUser = currentUser;
        this.blockScope = blockScope;
        this.sources = sources;
        this.jobs = jobs;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Summary summary() {
        AuthenticatedUser user = currentUser.get();
        Instant now = Instant.now(clock);
        WorkSource.Asker asker = new WorkSource.Asker(user.userId(), user.is(Role.STAFF), user.is(Role.MANAGER),
                user.is(Role.ADMIN), blockScope.resolve(null).ids());
        List<WorkItem> items = new ArrayList<>();
        sources.forEach(s -> items.addAll(s.work(asker, now)));
        if (asker.admin()) {
            List<ScheduledJobs.LastRun> failed = jobs.lastRuns().stream()
                    .filter(r -> Boolean.FALSE.equals(r.ok())).toList();
            if (!failed.isEmpty()) {
                items.add(new WorkItem("job-failed", "/admin/system-health", failed.size(), failed.size(), 0,
                        failed.stream().map(ScheduledJobs.LastRun::startedAt).min(Comparator.naturalOrder()).orElse(null)));
            }
        }
        items.sort(URGENCY);
        return new Summary(now, items);
    }
}
