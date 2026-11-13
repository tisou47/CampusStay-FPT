package vn.fpt.campusstay.controller.visitor;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.visitor.StudentFamilyDayService;

/** A resident's Family Days, guests and passes: ADR-29, contract A-69. */
@RestController
class StudentFamilyDayController {

    private final StudentFamilyDayService familyDays;

    StudentFamilyDayController(StudentFamilyDayService familyDays) {
        this.familyDays = familyDays;
    }

    @GetMapping("/students/me/family-days")
    StudentFamilyDayService.MyFamilyDays list() {
        return familyDays.list();
    }

    @GetMapping("/students/me/family-days/{id}")
    StudentFamilyDayService.MyFamilyDay detail(@PathVariable String id) {
        return familyDays.detail(id);
    }

    @PostMapping("/students/me/family-days/{id}/registration")
    @ResponseStatus(HttpStatus.CREATED)
    StudentFamilyDayService.MyFamilyDay register(@PathVariable String id,
            @RequestBody StudentFamilyDayService.RegisterCommand body) {
        return familyDays.register(id, body);
    }

    record SafetyRequest(@Size(max = 500, message = "Keep the note under 500 characters.") String note) {
    }

    /** The student confirms their guests still inside after the time slot are safe (contract A-70). */
    @PostMapping("/students/me/family-days/{id}/registration/safety-confirmation")
    StudentFamilyDayService.MyFamilyDay confirmSafety(@PathVariable String id,
            @Valid @RequestBody(required = false) SafetyRequest body) {
        return familyDays.confirmSafety(id, body == null ? null : body.note());
    }

    @PostMapping("/students/me/family-days/{id}/registration/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable String id) {
        familyDays.cancel(id);
    }
}
