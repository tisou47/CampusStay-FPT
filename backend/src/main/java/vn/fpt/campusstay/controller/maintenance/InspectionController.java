package vn.fpt.campusstay.controller.maintenance;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.maintenance.ChecklistService;
import vn.fpt.campusstay.service.maintenance.InspectionRunService;
import vn.fpt.campusstay.service.maintenance.InspectionScheduleService;
import vn.fpt.campusstay.dto.PageQuery;

/**
 * Inspections: checklists (Admin), schedules (Block Manager) and runs (Staff). Checklists are
 * addressed by their key ({@code CL-3}), runs by their code ({@code INS-12}).
 */
@RestController
class InspectionController {

    record NameRequest(@Size(max = 150, message = "Enter a name of at most 150 characters.") String name) {
    }

    record PublishRequest(@Size(max = 100, message = "Use at most 100 items.") List<ChecklistService.ItemInput> items) {
    }

    /** {@code meters}: the Room's readings (needed in a pre-arrival inspection). */
    record RoomRequest(@Size(max = 100) List<InspectionRunService.Result> results, InspectionRunService.Meters meters) {
    }

    private final ChecklistService checklists;
    private final InspectionScheduleService schedules;
    private final InspectionRunService runs;

    InspectionController(ChecklistService checklists, InspectionScheduleService schedules, InspectionRunService runs) {
        this.checklists = checklists;
        this.schedules = schedules;
        this.runs = runs;
    }

    // ---------------------------------------------------------------- checklists

    @GetMapping("/inspection-checklists")
    ChecklistService.Page checklists() {
        return checklists.list();
    }

    @PostMapping("/inspection-checklists")
    ChecklistService.Created createChecklist(@Valid @RequestBody NameRequest body) {
        return checklists.create(body.name());
    }

    @PostMapping("/inspection-checklists/{id}/publish")
    ChecklistService.Published publish(@PathVariable String id, @Valid @RequestBody PublishRequest body) {
        return checklists.publish(id, body.items());
    }

    @PostMapping("/inspection-checklists/{id}/archive")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void archive(@PathVariable String id) {
        checklists.archive(id);
    }

    @PutMapping("/inspection-checklists/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void renameChecklist(@PathVariable String id, @Valid @RequestBody NameRequest body) {
        checklists.rename(id, body.name());
    }

    @PostMapping("/inspection-checklists/{id}/restore")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void restoreChecklist(@PathVariable String id) {
        checklists.restore(id);
    }

    @DeleteMapping("/inspection-checklists/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteChecklist(@PathVariable String id) {
        checklists.delete(id);
    }

    // ---------------------------------------------------------------- schedules

    @GetMapping("/inspection-schedules")
    InspectionScheduleService.Page schedules(@RequestParam(required = false) String block) {
        return schedules.list(block);
    }

    @PostMapping("/inspection-schedules")
    InspectionScheduleService.Created createSchedule(@RequestBody Map<String, Object> body) {
        return schedules.create(body);
    }

    @PutMapping("/inspection-schedules/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void updateSchedule(@PathVariable String id, @RequestBody Map<String, Object> body) {
        schedules.update(id, body);
    }

    // ---------------------------------------------------------------- runs

    /** {@code termId} is accepted for the screen's filters; runs belong to a Block, not a Term. */
    @GetMapping("/inspection-runs/current")
    InspectionRunService.Current current(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return runs.current(block);
    }

    /** Every run of the user's Blocks they can open: open ones (their own first) and the ones sent lately. */
    @GetMapping("/inspection-runs")
    InspectionRunService.RunsPage list(@RequestParam(required = false) String block) {
        return runs.runs(block);
    }

    @GetMapping("/inspection-runs/{id:INS-\\d+|\\d+}")
    InspectionRunService.Current run(@PathVariable String id) {
        return runs.runView(id);
    }

    /** A photo of a furniture item ({@code itemId} "furniture-<id>") or, without it, of the meters. */
    @PostMapping(path = "/inspection-runs/{id}/rooms/{room}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    InspectionRunService.Photo addPhoto(@PathVariable String id, @PathVariable String room,
            @RequestParam(required = false) String itemId,
            @RequestPart(name = "photo", required = false) MultipartFile photo) {
        return runs.addPhoto(id, room, itemId, photo == null ? null : photo.getOriginalFilename(), bytes(photo));
    }

    @DeleteMapping("/inspection-runs/{id}/rooms/{room}/photos/{photoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removePhoto(@PathVariable String id, @PathVariable String room, @PathVariable String photoId) {
        runs.removePhoto(id, room, photoId);
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

    @GetMapping("/inspection-runs/upcoming")
    InspectionRunService.UpcomingPage upcoming(@RequestParam(required = false) String block) {
        return runs.upcoming(block);
    }

    @GetMapping("/inspection-runs/{id}/rooms")
    InspectionRunService.RoomsPage rooms(@PathVariable String id, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return runs.rooms(id, PageQuery.of(page, pageSize));
    }

    @PutMapping("/inspection-runs/{id}/rooms/{room}")
    InspectionRunService.Saved saveRoom(@PathVariable String id, @PathVariable String room,
            @Valid @RequestBody RoomRequest body) {
        return runs.saveRoom(id, room, body.results(), body.meters());
    }

    @PostMapping("/inspection-runs/{id}/rooms/{room}/unreachable")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void unreachable(@PathVariable String id, @PathVariable String room) {
        runs.unreachable(id, room);
    }

    /** {@code confirmed}: the inspector reviewed the results and commits to them (kept in the Audit Log). */
    record SubmitRequest(Boolean confirmed) {
    }

    @PostMapping("/inspection-runs/{id}/submit")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void submit(@PathVariable String id, @RequestBody(required = false) SubmitRequest body) {
        runs.submit(id, body != null && Boolean.TRUE.equals(body.confirmed()));
    }
}
