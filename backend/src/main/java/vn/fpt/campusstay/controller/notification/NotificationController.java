package vn.fpt.campusstay.controller.notification;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.notification.NotificationService;

/** {@code /notifications}: the bell of every layout (all roles); a student's also lists the board's announcements (C-41). */
@RestController
@RequestMapping("/notifications")
class NotificationController {

    private final NotificationService notifications;
    private final CurrentUser currentUser;

    NotificationController(NotificationService notifications, CurrentUser currentUser) {
        this.notifications = notifications;
        this.currentUser = currentUser;
    }

    @GetMapping
    NotificationService.Inbox list(@RequestParam(required = false) Integer limit) {
        return notifications.latest(currentUser.id(), currentUser.get().is(Role.STUDENT), limit);
    }

    @PostMapping("/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void readAll() {
        notifications.markAllRead(currentUser.id(), currentUser.get().is(Role.STUDENT));
    }

    @PostMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void read(@PathVariable String id) {
        notifications.markRead(currentUser.id(), id);
    }
}
