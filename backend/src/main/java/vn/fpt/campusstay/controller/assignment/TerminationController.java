package vn.fpt.campusstay.controller.assignment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.assignment.TerminationService;

/** Terminations of stays (spec §6.15): Managers start and cancel them; Staff read those of their Blocks. */
@RestController
class TerminationController {

    record StartRequest(@Size(max = 20) String studentCode, @Size(max = 40) String reason,
            @Size(max = 500, message = "Keep the note under 500 characters.") String note) {
    }

    record CancelRequest(@Size(max = 500, message = "Keep the reason under 500 characters.") String reason) {
    }

    private final TerminationService terminations;

    TerminationController(TerminationService terminations) {
        this.terminations = terminations;
    }

    @GetMapping("/terminations")
    TerminationService.TerminationPage list(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return terminations.list(termId, block, status, PageQuery.of(page, pageSize));
    }

    @PostMapping("/terminations")
    TerminationService.Started start(@Valid @RequestBody StartRequest body) {
        return terminations.start(new TerminationService.StartCommand(body.studentCode(), body.reason(), body.note()));
    }

    @PostMapping("/terminations/{id}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable String id, @Valid @RequestBody CancelRequest body) {
        terminations.cancel(id, body.reason());
    }
}
