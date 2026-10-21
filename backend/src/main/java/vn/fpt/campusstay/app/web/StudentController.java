package vn.fpt.campusstay.app.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.app.internal.StudentApplicationQueries;
import vn.fpt.campusstay.shared.web.PageQuery;

/** {@code /students/me/**} screens owned by APP ({@code /students/**} is Student only). */
@RestController
@RequestMapping("/students/me")
class StudentController {

    private final StudentApplicationQueries queries;

    StudentController(StudentApplicationQueries queries) {
        this.queries = queries;
    }

    @GetMapping("/home")
    StudentApplicationQueries.Home home(@RequestParam(required = false) Long termId) {
        return queries.home(termId);
    }

    @GetMapping("/profile")
    StudentApplicationQueries.Profile profile() {
        return queries.profile();
    }

    @GetMapping("/applications")
    StudentApplicationQueries.ApplicationPage applications(@RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return queries.mine(PageQuery.of(page, pageSize));
    }

    @GetMapping("/roommate-invitation")
    StudentApplicationQueries.InvitationView roommateInvitation() {
        return queries.invitation();
    }
}
