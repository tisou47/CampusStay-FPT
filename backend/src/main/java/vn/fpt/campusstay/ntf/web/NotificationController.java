package vn.fpt.campusstay.ntf.web;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.ntf.internal.NotificationService;

/** {@code /notifications}: the bell of every layout (all roles). */
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
        return notifications.latest(currentUser.id(), limit);
    }

    @PostMapping("/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void readAll() {
        notifications.markAllRead(currentUser.id());
    }

    @PostMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void read(@PathVariable long id) {
        notifications.markRead(currentUser.id(), id);
    }
}
