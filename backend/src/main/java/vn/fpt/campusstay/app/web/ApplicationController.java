package vn.fpt.campusstay.app.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.app.internal.ApplicationService;
import vn.fpt.campusstay.app.internal.EligibilityService;
import vn.fpt.campusstay.app.internal.StudentApplicationQueries;

/**
 * Application wizard and the student's Application. Applications are addressed
 * by their code ({@code APP-SP27-000123}, C-19); the Term is always the one open
 * for registration.
 */
@RestController
class ApplicationController {

    record RoommateCheckRequest(Long termId,
            @NotBlank(message = "Enter the student code.") @Size(max = 20, message = "Enter a valid student code.")
            String studentCode) {
    }

    record CreateRequest(Long termId, Long roomTypeId, Long roomClassId, @Valid RoommateRequest roommate,
            @Valid ContactRequest contact, ConsentRequest consent) {
    }

    record RoommateRequest(String mode, @Size(max = 20) String studentCode, @Valid PreferencesRequest preferences) {
    }

    record PreferencesRequest(@Size(max = 150) String region, @Size(max = 150) String semester,
            @Size(max = 150) String major) {
    }

    record ContactRequest(@Size(max = 20, message = "Enter a phone number of 8 to 15 digits.") String phone,
            @Size(max = 254, message = "Enter a valid email.") String email,
            @Size(max = 150, message = "Use at most 150 characters.") String emergencyName,
            @Size(max = 150) String relationship,
            @Size(max = 20, message = "Enter a phone number of 8 to 15 digits.") String emergencyPhone) {
    }

    record ConsentRequest(Boolean matching, Boolean rules) {
    }

    record CancelRequest(@Size(max = 500, message = "Keep the reason under 500 characters.") String reason) {
    }

    record RespondRequest(@NotNull(message = "Accept or decline the invitation.") Boolean accept) {
    }

    private final ApplicationService applications;
    private final EligibilityService eligibility;
    private final StudentApplicationQueries queries;

    ApplicationController(ApplicationService applications, EligibilityService eligibility,
            StudentApplicationQueries queries) {
        this.applications = applications;
        this.eligibility = eligibility;
        this.queries = queries;
    }

    @GetMapping("/applications/eligibility")
    EligibilityService.Eligibility eligibility(@RequestParam(required = false) Long termId) {
        return eligibility.forCurrentStudent(termId);
    }

    @PostMapping("/applications/roommate-check")
    ApplicationService.RoommateCheck roommateCheck(@Valid @RequestBody RoommateCheckRequest body) {
        return applications.checkRoommate(body.termId(), body.studentCode());
    }

    @PostMapping("/applications")
    ApplicationService.Created create(@Valid @RequestBody CreateRequest body) {
        return applications.create(new ApplicationService.CreateCommand(body.termId(), body.roomTypeId(),
                body.roomClassId(), roommate(body.roommate()), contact(body.contact()), consent(body.consent())));
    }

    @GetMapping("/applications/{id}")
    StudentApplicationQueries.ApplicationDetail detail(@PathVariable String id) {
        return queries.detail(id);
    }

    @PostMapping("/applications/{id}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable String id, @Valid @RequestBody(required = false) CancelRequest body) {
        applications.cancel(id, body == null ? null : body.reason());
    }

    @PostMapping("/roommate-invitations/{id}/respond")
    ApplicationService.Responded respond(@PathVariable long id, @Valid @RequestBody RespondRequest body) {
        return applications.respond(id, body.accept());
    }

    private static ApplicationService.Roommate roommate(RoommateRequest r) {
        if (r == null) {
            return null;
        }
        PreferencesRequest p = r.preferences();
        return new ApplicationService.Roommate(r.mode(), r.studentCode(),
                p == null ? null : new ApplicationService.Preferences(p.region(), p.semester(), p.major()));
    }

    private static ApplicationService.Contact contact(ContactRequest c) {
        return c == null ? null
                : new ApplicationService.Contact(c.phone(), c.email(), c.emergencyName(), c.relationship(),
                        c.emergencyPhone());
    }

    private static ApplicationService.Consent consent(ConsentRequest c) {
        return c == null ? null : new ApplicationService.Consent(c.matching(), c.rules());
    }
}
