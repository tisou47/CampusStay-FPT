package vn.fpt.campusstay.controller.report;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.report.WorkSummaryService;

/** The work waiting for the Staff member, Manager or Admin who asks: menu badges and the Today list. */
@RestController
class WorkSummaryController {

    private final WorkSummaryService work;

    WorkSummaryController(WorkSummaryService work) {
        this.work = work;
    }

    @GetMapping("/work/summary")
    WorkSummaryService.Summary summary() {
        return work.summary();
    }
}
