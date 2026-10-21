package vn.fpt.campusstay.mnt.web;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.mnt.internal.MaintenanceDeskService;
import vn.fpt.campusstay.mnt.internal.MaintenanceService;
import vn.fpt.campusstay.shared.web.PageQuery;

/**
 * Maintenance Requests. Students report and follow their own; Staff and
 * Managers work the queue of their Blocks. Requests are addressed by code
 * ({@code MR-000321}).
 */
@RestController
class MaintenanceController {

    record ConfirmRequest(Boolean fixed,
            @Size(max = 500, message = "Keep the comment under 500 characters.") String comment) {
    }

    record UpdateRequest(@Size(max = 2000, message = "Keep the update under 2,000 characters.") String message,
            Boolean internal) {
    }

    private final MaintenanceService maintenance;
    private final MaintenanceDeskService desk;
    private final CurrentUser currentUser;

    MaintenanceController(MaintenanceService maintenance, MaintenanceDeskService desk, CurrentUser currentUser) {
        this.maintenance = maintenance;
        this.desk = desk;
        this.currentUser = currentUser;
    }

    @GetMapping("/maintenance-requests/options")
    MaintenanceService.Options options(@RequestParam(name = "for", required = false) String forWhom) {
        return maintenance.options(forWhom);
    }

    @PostMapping(path = "/maintenance-requests", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    MaintenanceService.Created report(@RequestParam(required = false) String title,
            @RequestParam(required = false) String description, @RequestParam(required = false) String category,
            @RequestParam(required = false) String location, @RequestParam(required = false) String urgency,
            @RequestParam(required = false) String staffMayEnter,
            @RequestPart(name = "photos", required = false) List<MultipartFile> photos) {
        return maintenance.report(new MaintenanceService.ReportCommand(title, description, category, location, urgency,
                staffMayEnter, photos == null ? List.of() : photos.stream()
                        .map(p -> new MaintenanceService.Photo(p.getOriginalFilename(), bytes(p))).toList()));
    }

    @GetMapping("/maintenance-requests")
    MaintenanceDeskService.QueuePage queue(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) String q,
            @RequestParam(required = false) String status, @RequestParam(required = false) String priority,
            @RequestParam(required = false) String category, @RequestParam(required = false) String assigneeId,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return desk.queue(new MaintenanceDeskService.Filter(termId, block, q, status, priority, category, assigneeId),
                PageQuery.of(page, pageSize));
    }

    /** Student: their own request (public updates only). Staff and Managers: the full view. */
    @GetMapping("/maintenance-requests/{id}")
    Object detail(@PathVariable String id) {
        return currentUser.get().role().isBackOffice() ? desk.detail(id) : maintenance.studentView(id);
    }

    /** Fields left out stay as they are; {@code "assigneeId": null} unassigns. */
    @PatchMapping("/maintenance-requests/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        desk.update(id, body);
    }

    @PostMapping("/maintenance-requests/{id}/updates")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void addUpdate(@PathVariable String id, @Valid @RequestBody UpdateRequest body) {
        desk.addUpdate(id, body.message(), Boolean.TRUE.equals(body.internal()));
    }

    @PostMapping("/maintenance-requests/{id}/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void confirm(@PathVariable String id, @Valid @RequestBody ConfirmRequest body) {
        maintenance.confirm(id, body.fixed(), body.comment());
    }

    private static byte[] bytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
