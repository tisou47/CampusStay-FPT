package vn.fpt.campusstay.controller.setting;

import java.util.List;

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
 * one-form create and update were removed (BE-3RD-08): every Term goes through the wizard.
 */
@RestController
@RequestMapping("/admin/terms")
class AdminTermController {

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
