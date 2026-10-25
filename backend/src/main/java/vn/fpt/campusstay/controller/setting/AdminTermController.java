package vn.fpt.campusstay.controller.setting;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.setting.AdminTermService;
import vn.fpt.campusstay.service.setting.TermWizardService;

/**
 * Admin › Registration periods › Terms. The wizard (A-27, spec §6.4) creates a Draft
 * ({@code POST /admin/terms/drafts}, from a Manager's request or empty), reads it
 * ({@code GET /{id}/wizard}), saves one step at a time ({@code PUT /{id}/wizard/{step}}) and publishes it. The
 * one-form create and update stay for existing clients: fields may be null (the form sends empty fields as null);
 * the service names each missing one, and a null {@code depositHours} takes the default of Admin › Fees.
 */
@RestController
@RequestMapping("/admin/terms")
class AdminTermController {

    record TermRequest(
            @Size(max = 100, message = "Use at most 100 characters.") String name,
            LocalDate stayStart,
            LocalDate stayEnd,
            Instant registrationOpensAt,
            Instant registrationClosesAt,
            Instant resultsPublishedAt,
            Integer roommateHours,
            Integer depositHours,
            Instant balanceDueAt,
            LocalDate checkInStart,
            LocalDate checkInEnd,
            LocalDate checkOutBy) {

        AdminTermService.TermValues values() {
            return new AdminTermService.TermValues(name, stayStart, stayEnd, registrationOpensAt, registrationClosesAt,
                    resultsPublishedAt, roommateHours, depositHours, balanceDueAt, checkInStart, checkInEnd, checkOutBy);
        }
    }

    record TermList(List<AdminTermService.TermItem> items) {
    }

    record Saved(String id) {
    }

    private final AdminTermService terms;
    private final TermWizardService wizard;

    AdminTermController(AdminTermService terms, TermWizardService wizard) {
        this.terms = terms;
        this.wizard = wizard;
    }

    @GetMapping
    TermList list() {
        return new TermList(terms.list());
    }

    @PostMapping
    Saved create(@Valid @RequestBody TermRequest body) {
        return new Saved(String.valueOf(terms.create(body.values())));
    }

    @PutMapping("/{id}")
    Saved update(@PathVariable long id, @Valid @RequestBody TermRequest body) {
        return new Saved(String.valueOf(terms.update(id, body.values())));
    }

    @PostMapping("/drafts")
    Saved createDraft(@RequestBody TermWizardService.DraftBody body) {
        return new Saved(String.valueOf(wizard.createDraft(body)));
    }

    @GetMapping("/{id}/wizard")
    TermWizardService.Wizard read(@PathVariable long id) {
        return wizard.wizard(id);
    }

    @PutMapping("/{id}/wizard/{step}")
    Saved saveStep(@PathVariable long id, @PathVariable String step, @RequestBody TermWizardService.StepBody body) {
        return new Saved(String.valueOf(wizard.save(id, step, body)));
    }

    @PostMapping("/{id}/publish")
    Saved publish(@PathVariable long id) {
        return new Saved(String.valueOf(wizard.publish(id)));
    }
}
