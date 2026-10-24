package vn.fpt.campusstay.controller.auth;

import java.time.LocalDate;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.auth.StudentVerificationService;

/** The student's own sign-up form and verification status (ADR-26, contract change A-18; {@code /students/**} is Student only). */
@RestController
@RequestMapping("/students/me/verification")
class StudentVerificationController {

    record FormRequest(@Size(max = 20) String studentCode, @Size(max = 150, message = "Use at most 150 characters.") String name,
            @Size(max = 10) String gender, LocalDate dateOfBirth, @Size(max = 100) String major,
            @Size(max = 10) String cohort, @Size(max = 20, message = "Enter a phone number of 8 to 15 digits.") String phone) {
    }

    private final StudentVerificationService verification;

    StudentVerificationController(StudentVerificationService verification) {
        this.verification = verification;
    }

    @GetMapping
    StudentVerificationService.Status get() {
        return verification.get();
    }

    @PutMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void submit(@Valid @RequestBody FormRequest body) {
        verification.submit(new StudentVerificationService.Form(body.studentCode(), body.name(), body.gender(),
                body.dateOfBirth(), body.major(), body.cohort(), body.phone()));
    }
}
