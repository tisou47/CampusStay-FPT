package vn.fpt.campusstay.controller.notification;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.notification.AnnouncementService;

/**
 * Announcements (A-30, spec §6.5): {@code /announcements} for Staff (residents of their Blocks), Managers and the
 * Admin; {@code /students/me/board} for students, the announcements shown to them now.
 */
@RestController
class AnnouncementController {

    record Saved(String id) {
    }

    private final AnnouncementService announcements;

    AnnouncementController(AnnouncementService announcements) {
        this.announcements = announcements;
    }

    @GetMapping("/students/me/board")
    AnnouncementService.Board board() {
        return announcements.board();
    }

    @GetMapping("/announcements")
    AnnouncementService.AdminList list(@RequestParam(required = false) String q,
            @RequestParam(required = false) String category, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return announcements.list(q, category, PageQuery.of(page, pageSize));
    }

    @GetMapping("/announcements/options")
    AnnouncementService.Options options() {
        return announcements.options();
    }

    @PostMapping("/announcements")
    @ResponseStatus(HttpStatus.CREATED)
    Saved create(@RequestBody AnnouncementService.NewAnnouncement body) {
        return new Saved(String.valueOf(announcements.create(body)));
    }

    @PutMapping("/announcements/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void change(@PathVariable long id, @RequestBody AnnouncementService.Change body) {
        announcements.change(id, body);
    }
}
