package vn.fpt.campusstay.service.maintenance;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.common.export.ReportExport;

/** {@code GET /exports/maintenance}: the Maintenance queue with its filters. */
@Component
class MaintenanceExport implements ReportExport {

    private final MaintenanceDeskService desk;
    private final CurrentUser currentUser;

    MaintenanceExport(MaintenanceDeskService desk, CurrentUser currentUser) {
        this.desk = desk;
        this.currentUser = currentUser;
    }

    @Override
    public String report() {
        return "maintenance";
    }

    @Override
    @Transactional(readOnly = true)
    public Table export(Map<String, String> f) {
        currentUser.require(Permission.PROCESS_MAINTENANCE);
        MaintenanceDeskService.QueuePage page = desk.queue(new MaintenanceDeskService.Filter(
                ReportExport.longFilter(f, "termId"), f.get("block"), f.get("q"), f.get("status"), f.get("priority"),
                f.get("category"), f.get("assigneeId")), ALL);
        return new Table("maintenance-requests", List.of("Request", "Room", "Title", "Category", "Priority",
                "Reported at", "Assignee", "Status"),
                page.items().stream().map(i -> Arrays.<Object>asList(i.id(), i.room(), i.title(), i.category(), i.priority(),
                        i.reportedAt(), i.assignee() == null ? "" : i.assignee().name(), i.status())).toList());
    }
}
