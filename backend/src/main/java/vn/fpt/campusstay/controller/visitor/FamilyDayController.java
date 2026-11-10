package vn.fpt.campusstay.controller.visitor;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.visitor.FamilyDayService;

/** Family Days for Managers (organise) and the Block's Staff (read): ADR-29, contract A-69. */
@RestController
class FamilyDayController {

    record ReasonRequest(@Size(max = 500, message = "Keep the reason under 500 characters.") String reason) {
    }

    record CloseRequest(@Size(max = 500, message = "Keep the note under 500 characters.") String note) {
    }

    private final FamilyDayService familyDays;

    FamilyDayController(FamilyDayService familyDays) {
        this.familyDays = familyDays;
    }

    @GetMapping("/family-days")
    FamilyDayService.FamilyDayPage list(@RequestParam(required = false) String block,
            @RequestParam(required = false) String status, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return familyDays.list(block, status, PageQuery.of(page, pageSize));
    }

    @PostMapping("/family-days")
    @ResponseStatus(HttpStatus.CREATED)
    FamilyDayService.FamilyDayDetail create(@RequestBody FamilyDayService.SaveCommand body) {
        return familyDays.create(body);
    }

    @GetMapping("/family-days/{id}")
    FamilyDayService.FamilyDayDetail detail(@PathVariable String id) {
        return familyDays.detail(id);
    }

    @PutMapping("/family-days/{id}")
    FamilyDayService.FamilyDayDetail update(@PathVariable String id, @RequestBody FamilyDayService.SaveCommand body) {
        return familyDays.update(id, body);
    }

    @PostMapping("/family-days/{id}/publish")
    FamilyDayService.FamilyDayDetail publish(@PathVariable String id) {
        return familyDays.publish(id);
    }

    @PostMapping("/family-days/{id}/cancel")
    FamilyDayService.FamilyDayDetail cancel(@PathVariable String id, @Valid @RequestBody ReasonRequest body) {
        return familyDays.cancel(id, body.reason());
    }

    @PostMapping("/family-days/{id}/close")
    FamilyDayService.FamilyDayDetail close(@PathVariable String id, @Valid @RequestBody(required = false) CloseRequest body) {
        return familyDays.close(id, body == null ? null : body.note());
    }

    @GetMapping("/family-days/{id}/registrations")
    FamilyDayService.RegistrationPage registrations(@PathVariable String id,
            @RequestParam(required = false) String slotId, @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return familyDays.registrations(id, slotId, q, PageQuery.of(page, pageSize));
    }

    @PostMapping("/family-day-registrations/{id}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancelRegistration(@PathVariable String id, @Valid @RequestBody ReasonRequest body) {
        familyDays.cancelRegistration(id, body.reason());
    }
}
