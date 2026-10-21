package vn.fpt.campusstay.asg.web;

import java.io.IOException;
import java.io.UncheckedIOException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import vn.fpt.campusstay.asg.internal.LateCheckInService;

/** Late check-ins: Staff record them at the desk (A-12), the Block Manager decides. */
@RestController
class LateCheckInController {

    record DecisionRequest(@Size(max = 20) String decision, @Size(max = 10) String deadline,
            @Size(max = 500, message = "Keep the reason under 500 characters.") String reason) {
    }

    private final LateCheckInService lateCheckIns;

    LateCheckInController(LateCheckInService lateCheckIns) {
        this.lateCheckIns = lateCheckIns;
    }

    @PostMapping(path = "/late-check-ins", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    LateCheckInService.Created create(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String studentCode, @RequestParam(required = false) String reason,
            @RequestParam(required = false) String requestedFor,
            @RequestPart(name = "evidence", required = false) MultipartFile evidence) {
        return lateCheckIns.create(new LateCheckInService.CreateCommand(termId, studentCode, reason, requestedFor,
                evidence == null ? null : evidence.getOriginalFilename(), bytes(evidence)));
    }

    @GetMapping("/late-check-ins")
    LateCheckInService.Page list(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return lateCheckIns.list(termId, block);
    }

    @PostMapping("/late-check-ins/{id}/decision")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void decide(@PathVariable String id, @Valid @RequestBody DecisionRequest body) {
        lateCheckIns.decide(id, body.decision(), body.deadline(), body.reason());
    }

    private static byte[] bytes(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return null;
        }
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
