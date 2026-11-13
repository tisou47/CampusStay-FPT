package vn.fpt.campusstay.controller.visitor;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.visitor.FamilyDayStatsService;

/** Family Day statistics for Staff, Managers and the Admin: contract A-70. */
@RestController
class FamilyDayStatsController {

    private final FamilyDayStatsService stats;

    FamilyDayStatsController(FamilyDayStatsService stats) {
        this.stats = stats;
    }

    @GetMapping("/family-day-stats")
    FamilyDayStatsService.Overview overview(@RequestParam(required = false) String block) {
        return stats.overview(block);
    }

    @GetMapping("/family-days/{id}/stats")
    FamilyDayStatsService.FamilyDayStats stats(@PathVariable String id) {
        return stats.stats(id);
    }
}
