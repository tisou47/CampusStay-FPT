package vn.fpt.campusstay.controller.assignment;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.assignment.HandoverDeskService;
import vn.fpt.campusstay.service.assignment.StudentHandoverService;

/**
 * The check-in inventory: the student's own ({@code /students/me/handover}, mobile app) and Staff's review of their
 * Blocks' inventories ({@code /handovers}, web).
 */
@RestController
class HandoverController {

    record CommentRequest(@Size(max = 500, message = "Keep your comment under 500 characters.") String comment) {
    }

    record NoteRequest(@Size(max = 500, message = "Describe what you found in at most 500 characters.") String note) {
    }

    record ReasonRequest(@Size(max = 500, message = "Keep the reason under 500 characters.") String reason) {
    }

    record VisitRequest(Instant visitAt) {
    }

    record VerificationRequest(@Size(max = 100) List<HandoverDeskService.VerifyItem> items,
            java.math.BigDecimal electricity, java.math.BigDecimal water, Boolean send, Boolean finalizeOnSite) {
    }

    record LateRequest(@Size(max = 100) List<HandoverDeskService.VerifyItem> items) {
    }

    private final StudentHandoverService students;
    private final HandoverDeskService desk;

    HandoverController(StudentHandoverService students, HandoverDeskService desk) {
        this.students = students;
        this.desk = desk;
    }

    // ---------------------------------------------------------------- student

    @GetMapping("/students/me/handover")
    StudentHandoverService.View mine() {
        return students.mine();
    }

    @PostMapping("/students/me/handover/start")
    StudentHandoverService.Started start() {
        return students.start();
    }

    @PutMapping("/students/me/handover")
    StudentHandoverService.View save(@RequestBody StudentHandoverService.SaveCommand body) {
        return students.save(body);
    }

    @PostMapping(path = "/students/me/handover/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    StudentHandoverService.Photo addPhoto(@RequestParam(required = false) String itemId,
            @RequestPart(name = "photo", required = false) MultipartFile photo) {
        return students.addPhoto(itemId, photo == null ? null : photo.getOriginalFilename(), bytes(photo));
    }

    @DeleteMapping("/students/me/handover/photos/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removePhoto(@PathVariable String id) {
        students.removePhoto(id);
    }

    @PostMapping("/students/me/handover/submit")
    StudentHandoverService.View submit(@RequestBody(required = false) StudentHandoverService.SaveCommand body) {
        return students.submit(body);
    }

    @PostMapping("/students/me/handover/agree")
    StudentHandoverService.View agree(@Valid @RequestBody(required = false) CommentRequest body) {
        return students.agree(body == null ? null : body.comment());
    }

    @PostMapping("/students/me/handover/late")
    StudentHandoverService.View late(@Valid @RequestBody NoteRequest body) {
        return students.late(body.note());
    }

    // ---------------------------------------------------------------- Staff

    @GetMapping("/handovers")
    HandoverDeskService.Page list(@RequestParam(required = false) String block,
            @RequestParam(required = false) String status, @RequestParam(required = false) String comparison,
            @RequestParam(required = false) String room, @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return desk.list(block, status, comparison, room, q, PageQuery.of(page, pageSize));
    }

    @GetMapping("/handovers/{id}")
    HandoverDeskService.Detail detail(@PathVariable String id) {
        return desk.detail(id);
    }

    @PostMapping("/handovers/{id}/confirm")
    HandoverDeskService.Detail confirm(@PathVariable String id, @Valid @RequestBody(required = false) ReasonRequest body) {
        return desk.confirm(id, body == null ? null : body.reason());
    }

    @PostMapping("/handovers/{id}/visit")
    HandoverDeskService.Detail visit(@PathVariable String id, @RequestBody(required = false) VisitRequest body) {
        return desk.requestVisit(id, body == null ? null : body.visitAt());
    }

    @PutMapping("/handovers/{id}/verification")
    HandoverDeskService.Detail verification(@PathVariable String id, @Valid @RequestBody VerificationRequest body) {
        return desk.saveVerification(id, new HandoverDeskService.Verification(body.items(), body.electricity(),
                body.water()), Boolean.TRUE.equals(body.send()), Boolean.TRUE.equals(body.finalizeOnSite()));
    }

    @PostMapping("/handovers/{id}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable String id, @Valid @RequestBody ReasonRequest body) {
        desk.cancel(id, body.reason());
    }

    @PostMapping("/handovers/{id}/late")
    HandoverDeskService.Detail acceptLate(@PathVariable String id, @Valid @RequestBody LateRequest body) {
        return desk.acceptLate(id, body.items());
    }

    private static byte[] bytes(MultipartFile file) {
        if (file == null) {
            return null;
        }
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
