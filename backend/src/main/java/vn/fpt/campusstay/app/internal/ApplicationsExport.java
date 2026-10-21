package vn.fpt.campusstay.app.internal;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.auth.Permission;
import vn.fpt.campusstay.shared.export.ReportExport;

/** {@code GET /exports/applications}: the review queue with its filters. */
@Component
class ApplicationsExport implements ReportExport {

    private final ApplicationReviewService reviews;
    private final CurrentUser currentUser;

    ApplicationsExport(ApplicationReviewService reviews, CurrentUser currentUser) {
        this.reviews = reviews;
        this.currentUser = currentUser;
    }

    @Override
    public String report() {
        return "applications";
    }

    @Override
    @Transactional(readOnly = true)
    public Table export(Map<String, String> f) {
        currentUser.require(Permission.REVIEW_APPLICATIONS);
        ApplicationReviewService.QueuePage page = reviews.queue(new ApplicationReviewService.Filter(
                ReportExport.longFilter(f, "termId"), f.get("block"), f.get("q"), f.get("status"),
                ReportExport.longFilter(f, "roomTypeId"), ReportExport.longFilter(f, "roomClassId"),
                f.get("submittedWithin")), ALL);
        return new Table("applications", List.of("Application", "Student", "Student code", "Roommate pair",
                "Room Type", "Room Class", "Deposit", "Deposit paid at", "Status"),
                page.items().stream().map(i -> Arrays.<Object>asList(i.id(), i.studentName(), i.studentCode(),
                        i.pair() ? "Yes" : "No", or(i.roomTypeName()), or(i.roomClassName()), or(i.depositStatus()),
                        i.depositPaidAt() == null ? "" : i.depositPaidAt(), i.status())).toList());
    }

    private static String or(String value) {
        return value == null ? "" : value;
    }
}
