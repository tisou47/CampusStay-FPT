package vn.fpt.campusstay.auth.internal;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.auth.Permission;
import vn.fpt.campusstay.shared.export.ReportExport;

/** {@code GET /exports/audit-log}: Admin › Audit Log with its filters. */
@Component
class AuditLogExport implements ReportExport {

    private final AuditTrailService trail;
    private final CurrentUser currentUser;

    AuditLogExport(AuditTrailService trail, CurrentUser currentUser) {
        this.trail = trail;
        this.currentUser = currentUser;
    }

    @Override
    public String report() {
        return "audit-log";
    }

    @Override
    @Transactional(readOnly = true)
    public Table export(Map<String, String> f) {
        currentUser.require(Permission.READ_AUDIT_LOG);
        AuditTrailService.AuditPage page = trail.list(f.get("q"), f.get("actor"), f.get("action"), f.get("range"), ALL);
        return new Table("audit-log", List.of("Time", "Actor", "Action", "Object", "Change"),
                page.items().stream().map(i -> Arrays.<Object>asList(i.at(), i.actor(), i.action(),
                        i.object() == null ? "" : i.object(), i.change() == null ? "" : i.change())).toList());
    }
}
