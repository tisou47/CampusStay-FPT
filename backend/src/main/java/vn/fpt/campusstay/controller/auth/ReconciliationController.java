package vn.fpt.campusstay.controller.auth;

import java.io.IOException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.service.auth.ReconciliationService;

/** Manager › Reconciliation: the enrolled list (or a leavers list) of a Term against its residents (D-28, spec §6.12). */
@RestController
@RequestMapping("/reconciliations")
class ReconciliationController {

    record ResolveRequest(@Size(max = 20) String outcome,
            @Size(max = 500, message = "Keep the note under 500 characters.") String note) {
    }

    private final ReconciliationService reconciliations;

    ReconciliationController(ReconciliationService reconciliations) {
        this.reconciliations = reconciliations;
    }

    @GetMapping
    ReconciliationService.Overview overview(@RequestParam(required = false) Long termId) {
        return reconciliations.overview(termId);
    }

    @GetMapping("/template")
    ResponseEntity<byte[]> template(@RequestParam(required = false) String kind) {
        ReconciliationService.Template template = reconciliations.template(kind);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(template.fileName()).build().toString())
                .body(template.bytes());
    }

    /** {@code kind}: {@code enrolled} or {@code leavers}. */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ReconciliationService.Detail upload(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String kind,
            @RequestPart(name = "file", required = false) MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw FieldErrors.single("file", "Choose a CSV or XLSX file.");
        }
        return reconciliations.upload(termId, kind, file.getOriginalFilename(), file.getBytes());
    }

    @GetMapping("/{id}")
    ReconciliationService.Detail detail(@PathVariable String id) {
        return reconciliations.detail(id);
    }

    @PostMapping("/{id}/items/{itemId}/resolve")
    ReconciliationService.Item resolve(@PathVariable String id, @PathVariable String itemId,
            @Valid @RequestBody ResolveRequest body) {
        return reconciliations.resolve(id, itemId, body.outcome(), body.note());
    }
}
