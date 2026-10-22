package vn.fpt.campusstay.service.billing;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.common.export.ReportExport;

/** {@code GET /exports/payments}: Staff › Payments with its filters. */
@Component
class PaymentsExport implements ReportExport {

    private final PaymentDeskService payments;
    private final CurrentUser currentUser;

    PaymentsExport(PaymentDeskService payments, CurrentUser currentUser) {
        this.payments = payments;
        this.currentUser = currentUser;
    }

    @Override
    public String report() {
        return "payments";
    }

    @Override
    @Transactional(readOnly = true)
    public Table export(Map<String, String> f) {
        currentUser.require(Permission.CONFIRM_PAYMENTS);
        PaymentDeskService.PaymentPage page = payments.list(new PaymentDeskService.Filter(
                ReportExport.longFilter(f, "termId"), f.get("block"), f.get("q"), f.get("type"), f.get("status"),
                f.get("method"), f.get("date")), ALL);
        return new Table("payments", List.of("Invoice", "Student", "Student code", "Type", "Amount (VND)", "Method",
                "Paid at", "Due", "Status", "Bank reference", "Transfer content"),
                page.items().stream().map(i -> Arrays.<Object>asList(i.invoiceId(), i.studentName(), i.studentCode(),
                        i.typeLabel(), i.amount(), or(i.method()), i.paidAt() == null ? "" : i.paidAt(),
                        i.dueAt() == null ? "" : i.dueAt(), i.status(), or(i.reference()), or(i.transferContent())))
                        .toList());
    }

    private static String or(String value) {
        return value == null ? "" : value;
    }
}
