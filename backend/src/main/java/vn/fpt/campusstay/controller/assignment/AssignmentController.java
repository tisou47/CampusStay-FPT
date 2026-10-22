package vn.fpt.campusstay.controller.assignment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.assignment.AssignmentQueries;
import vn.fpt.campusstay.service.assignment.AssignmentService;
import vn.fpt.campusstay.dto.PageQuery;

/**
 * Assignment runs: Staff start a run, resolve conflicts and submit a Block's
 * proposal; the Manager reviews the Rooms and approves (commits) or returns it.
 * Runs are addressed as {@code RUN-<id>}, Applications by their code.
 */
@RestController
class AssignmentController {

    record StartRequest(Long termId, Boolean dryRun) {
    }

    record ResolveRequest(@Size(max = 40) String optionKey, Boolean waitlist) {
    }

    record BlockRequest(@NotBlank(message = "Choose a Block.") @Size(max = 10) String block) {
    }

    record ReturnRequest(@NotBlank(message = "Choose a Block.") @Size(max = 10) String block,
            @NotBlank(message = "Tell Staff what to change.")
            @Size(max = 500, message = "Keep the comment under 500 characters.") String comment) {
    }

    private final AssignmentService assignments;
    private final AssignmentQueries queries;

    AssignmentController(AssignmentService assignments, AssignmentQueries queries) {
        this.assignments = assignments;
        this.queries = queries;
    }

    @GetMapping("/assignment-runs")
    AssignmentQueries.Overview runs(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return queries.overview(termId, block);
    }

    @PostMapping("/assignment-runs")
    AssignmentService.Started start(@Valid @RequestBody StartRequest body) {
        return assignments.start(body.termId(), Boolean.TRUE.equals(body.dryRun()));
    }

    @GetMapping("/assignment-runs/{runId}/proposal")
    AssignmentQueries.Proposal proposal(@PathVariable String runId, @RequestParam(required = false) String block,
            @RequestParam(required = false) String view, @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return queries.proposal(runId, block, view, q, PageQuery.of(page, pageSize));
    }

    @GetMapping("/assignment-runs/{runId}/conflicts/{applicationId}")
    AssignmentQueries.Conflict conflict(@PathVariable String runId, @PathVariable String applicationId) {
        return queries.conflict(runId, applicationId);
    }

    @PostMapping("/assignment-runs/{runId}/conflicts/{applicationId}/resolve")
    AssignmentService.Resolved resolve(@PathVariable String runId, @PathVariable String applicationId,
            @Valid @RequestBody ResolveRequest body) {
        return assignments.resolve(runId, applicationId, body.optionKey(), Boolean.TRUE.equals(body.waitlist()));
    }

    @PostMapping("/assignment-runs/{runId}/commit")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void commit(@PathVariable String runId, @Valid @RequestBody BlockRequest body) {
        assignments.submit(runId, body.block());
    }

    @GetMapping("/assignment-runs/{runId}/rooms")
    AssignmentQueries.RoomPage rooms(@PathVariable String runId, @RequestParam(required = false) String block,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return queries.rooms(runId, block, PageQuery.of(page, pageSize));
    }

    @PostMapping("/assignment-runs/{runId}/approve")
    AssignmentService.Approved approve(@PathVariable String runId, @Valid @RequestBody BlockRequest body) {
        return assignments.approve(runId, body.block());
    }

    @PostMapping("/assignment-runs/{runId}/return")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void returnToStaff(@PathVariable String runId, @Valid @RequestBody ReturnRequest body) {
        assignments.returnToStaff(runId, body.block(), body.comment());
    }

    @GetMapping("/approvals/assignment")
    AssignmentQueries.Approval approval(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return queries.approval(termId, block);
    }
}
