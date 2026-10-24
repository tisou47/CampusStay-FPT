package vn.fpt.campusstay.controller.auth;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import jakarta.validation.Valid;

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

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.service.auth.StudentImportService;

/** Manager › Import student list: template, upload and preview, confirm, history (D-07, spec §6.2; contract change A-20). */
@RestController
@RequestMapping("/student-imports")
class StudentImportController {

    /** {@code markMissingNotEnrolled}: students the file does not list become Not enrolled (default false). */
    record ConfirmRequest(Boolean markMissingNotEnrolled) {
    }

    private final StudentImportService imports;

    StudentImportController(StudentImportService imports) {
        this.imports = imports;
    }

    @GetMapping
    StudentImportService.History history(@RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return imports.history(PageQuery.of(page, pageSize));
    }

    @GetMapping("/template")
    ResponseEntity<byte[]> template() {
        StudentImportService.Template template = imports.template();
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(template.fileName()).build().toString())
                .body(template.bytes());
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    StudentImportService.Import upload(@RequestPart(name = "file", required = false) MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw FieldErrors.single("file", "Choose a CSV or XLSX file.");
        }
        return imports.upload(file.getOriginalFilename(), file.getBytes());
    }

    @GetMapping("/{id}")
    StudentImportService.Import get(@PathVariable String id, @RequestParam(required = false) String outcome,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return imports.get(id, outcome, PageQuery.of(page, pageSize));
    }

    @PostMapping("/{id}/confirm")
    StudentImportService.Import confirm(@PathVariable String id, @Valid @RequestBody(required = false) ConfirmRequest body) {
        return imports.confirm(id, body != null && Boolean.TRUE.equals(body.markMissingNotEnrolled()));
    }
}
