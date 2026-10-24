package vn.fpt.campusstay.controller.auth;

import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.auth.StudentAccountService;

/**
 * Manager › Students: the student list, the student hub, directory fields, verification and locking (spec §6.2,
 * §11.3; contract change A-19). Staff read the residents of their Blocks.
 */
@RestController
@RequestMapping("/student-accounts")
class StudentAccountController {

    record EditRequest(@Size(max = 150, message = "Use at most 150 characters.") String name,
            @Size(max = 20) String studentCode, @Size(max = 10) String gender, LocalDate dateOfBirth,
            @Size(max = 100) String major, @Size(max = 10) String cohort, Integer semester,
            @Size(max = 100, message = "Use at most 100 characters.") String hometown, @Size(max = 100) String region,
            @Size(max = 30) String enrollment, @Size(max = 20) List<@Size(max = 40) String> priorityGroups,
            @Size(max = 20, message = "Enter a phone number of 8 to 15 digits.") String phone) {
    }

    record ReasonRequest(@Size(max = 500, message = "Use at most 500 characters.") String reason) {
    }

    private final StudentAccountService students;

    StudentAccountController(StudentAccountService students) {
        this.students = students;
    }

    @GetMapping
    StudentAccountService.Page list(@RequestParam(required = false) String q,
            @RequestParam(required = false) String verification, @RequestParam(required = false) String enrollment,
            @RequestParam(required = false) String gender, @RequestParam(required = false) String cohort,
            @RequestParam(required = false) String resident, @RequestParam(required = false) String block,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return students.list(new StudentAccountService.Filter(q, verification, enrollment, gender, cohort, resident,
                block), PageQuery.of(page, pageSize));
    }

    @GetMapping("/{id}")
    StudentAccountService.Hub hub(@PathVariable String id) {
        return students.hub(id);
    }

    @PutMapping("/{id}")
    StudentAccountService.Hub edit(@PathVariable String id, @Valid @RequestBody EditRequest body) {
        return students.edit(id, new StudentAccountService.Edit(body.name(), body.studentCode(), body.gender(),
                body.dateOfBirth(), body.major(), body.cohort(), body.semester(), body.hometown(), body.region(),
                body.enrollment(), body.priorityGroups(), body.phone()));
    }

    @PostMapping("/{id}/verify")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void verify(@PathVariable String id) {
        students.verify(id);
    }

    @PostMapping("/{id}/reject")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void reject(@PathVariable String id, @Valid @RequestBody ReasonRequest body) {
        students.reject(id, body.reason());
    }

    @PostMapping("/{id}/lock")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void lock(@PathVariable String id, @Valid @RequestBody ReasonRequest body) {
        students.lock(id, body.reason());
    }

    @PostMapping("/{id}/unlock")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void unlock(@PathVariable String id) {
        students.unlock(id);
    }
}
