package vn.fpt.campusstay.controller.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.auth.PrivacyService;

/** My data under Decree 13/2023 (W3-D3, contract "My data"): the student's own side and the Managers' queue. */
@RestController
class PrivacyController {

    record ConsentRequest(@Size(max = 20) String version) {
    }

    record ErasureRequest(@Size(max = 500, message = "Use at most 500 characters.") String reason) {
    }

    record DecisionRequest(@Size(max = 20) String decision,
            @Size(max = 500, message = "Use at most 500 characters.") String note) {
    }

    private final PrivacyService privacy;

    PrivacyController(PrivacyService privacy) {
        this.privacy = privacy;
    }

    @GetMapping("/students/me/privacy")
    PrivacyService.Status status() {
        return privacy.status();
    }

    @PostMapping("/students/me/privacy/consent")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void consent(@Valid @RequestBody ConsentRequest body) {
        privacy.consent(body.version());
    }

    @GetMapping("/students/me/privacy/export")
    ResponseEntity<PrivacyService.Export> export() {
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"my-data.json\"")
                .body(privacy.export());
    }

    @PostMapping("/students/me/privacy/erasure")
    PrivacyService.Created erasure(@Valid @RequestBody(required = false) ErasureRequest body) {
        return privacy.requestErasure(body == null ? null : body.reason());
    }

    @GetMapping("/privacy/erasure-requests")
    PrivacyService.Page requests(@RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return privacy.requests(status, PageQuery.of(page, pageSize));
    }

    @PostMapping("/privacy/erasure-requests/{id}/decision")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void decide(@PathVariable String id, @Valid @RequestBody DecisionRequest body) {
        privacy.decide(id, body.decision(), body.note());
    }
}
