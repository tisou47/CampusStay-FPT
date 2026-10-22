package vn.fpt.campusstay.controller.request;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.request.StudentRequestsService;
import vn.fpt.campusstay.dto.PageQuery;

/** The student's Maintenance and Room-Change Requests. */
@RestController
class StudentRequestsController {

    private final StudentRequestsService requests;

    StudentRequestsController(StudentRequestsService requests) {
        this.requests = requests;
    }

    @GetMapping("/students/me/requests")
    StudentRequestsService.Page mine(@RequestParam(required = false) String kind,
            @RequestParam(required = false) Long termId, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return requests.mine(kind, termId, PageQuery.of(page, pageSize));
    }
}
