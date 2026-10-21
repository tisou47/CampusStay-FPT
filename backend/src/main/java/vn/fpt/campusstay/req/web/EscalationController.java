package vn.fpt.campusstay.req.web;

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

import vn.fpt.campusstay.req.internal.EscalationService;

/** Block Manager › Escalations; an item is addressed by its request's code (MR-…, RC-…). */
@RestController
class EscalationController {

    record ActionRequest(@Size(max = 20) String action, Object assigneeId,
            @Size(max = 1000, message = "Keep the note under 1,000 characters.") String note) {
    }

    private final EscalationService escalations;

    EscalationController(EscalationService escalations) {
        this.escalations = escalations;
    }

    @GetMapping("/escalations")
    EscalationService.Page list(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return escalations.list(termId, block);
    }

    @PostMapping("/escalations/{id}/actions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void act(@PathVariable String id, @Valid @RequestBody ActionRequest body) {
        escalations.act(id, body.action(), body.assigneeId(), body.note());
    }
}
