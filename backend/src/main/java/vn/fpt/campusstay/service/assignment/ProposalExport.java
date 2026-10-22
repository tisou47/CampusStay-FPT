package vn.fpt.campusstay.service.assignment;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Permission;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.common.export.ReportExport;

/** {@code GET /exports/assignment-proposal?runId&block}: one Block tab (or the waitlist) of a run's proposal. */
@Component
class ProposalExport implements ReportExport {

    private final AssignmentQueries queries;
    private final CurrentUser currentUser;

    ProposalExport(AssignmentQueries queries, CurrentUser currentUser) {
        this.queries = queries;
        this.currentUser = currentUser;
    }

    @Override
    public String report() {
        return "assignment-proposal";
    }

    @Override
    @Transactional(readOnly = true)
    public Table export(Map<String, String> f) {
        currentUser.require(Permission.RUN_ASSIGNMENT);
        String run = f.get("runId");
        if (run == null || run.isBlank()) {
            throw FieldErrors.single("runId", "Choose a run.");
        }
        AssignmentQueries.Proposal proposal = queries.proposal(run.trim(), f.get("block"), f.get("view"), f.get("q"), ALL);
        String tab = f.get("block") == null || f.get("block").isBlank() ? "" : "-" + f.get("block").trim();
        return new Table(proposal.run().id() + tab + "-proposal", List.of("Application", "Student", "Student code",
                "Roommate pair", "Preference", "Bed", "Fit (%)", "Issue", "Resolved", "Note"),
                proposal.items().stream().map(i -> Arrays.<Object>asList(i.applicationId(), i.studentName(),
                        i.studentCode(), i.pair() ? "Yes" : "No", i.preference(), i.bed(), i.fit(),
                        i.issue() == null ? null : i.issue().label(), i.resolved() ? "Yes" : "No", i.reason()))
                        .toList());
    }
}
