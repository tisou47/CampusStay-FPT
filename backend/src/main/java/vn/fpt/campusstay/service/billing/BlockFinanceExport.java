package vn.fpt.campusstay.service.billing;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.common.export.ReportExport;

/** {@code GET /exports/block-finance}: the Invoices of Block Finance. */
@Component
class BlockFinanceExport implements ReportExport {

    private final FinanceService finance;
    private final CurrentUser currentUser;

    BlockFinanceExport(FinanceService finance, CurrentUser currentUser) {
        this.finance = finance;
        this.currentUser = currentUser;
    }

    @Override
    public String report() {
        return "block-finance";
    }

    @Override
    @Transactional(readOnly = true)
    public Table export(Map<String, String> f) {
        currentUser.require(Permission.VIEW_REPORTS);
        FinanceService.InvoicePage page = finance.invoices(ReportExport.longFilter(f, "termId"), f.get("block"), ALL);
        return new Table("block-finance", List.of("Invoice", "Student", "Student code", "Type", "Amount (VND)", "Due",
                "Status"),
                page.items().stream().map(i -> Arrays.<Object>asList(i.id(), i.name(), i.studentCode(), i.typeLabel(),
                        i.amount(), i.dueAt() == null ? "" : i.dueAt(), i.status())).toList());
    }
}
