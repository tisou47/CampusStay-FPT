package vn.fpt.campusstay.asg.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.asg.internal.StudentAllocationService;

/** The student's Room, Bed, roommates, Check-in window and Balance Invoice. */
@RestController
class StudentAllocationController {

    private final StudentAllocationService allocations;

    StudentAllocationController(StudentAllocationService allocations) {
        this.allocations = allocations;
    }

    @GetMapping("/students/me/allocation")
    StudentAllocationService.MyRoom mine(@RequestParam(required = false) Long termId) {
        return allocations.mine(termId);
    }
}
