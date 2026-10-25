package vn.fpt.campusstay.controller.report;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.report.DashboardService;
import vn.fpt.campusstay.service.report.TermDashboardService;
import vn.fpt.campusstay.service.report.ExportService;
import vn.fpt.campusstay.service.report.ReportService;

/** Dashboards, reports and exports. Everything is scoped to the user's Blocks. */
@RestController
class ReportController {

    private final DashboardService dashboards;
    private final TermDashboardService termDashboard;
    private final ReportService reports;
    private final ExportService exports;

    ReportController(DashboardService dashboards, TermDashboardService termDashboard, ReportService reports,
            ExportService exports) {
        this.dashboards = dashboards;
        this.termDashboard = termDashboard;
        this.reports = reports;
        this.exports = exports;
    }

    @GetMapping("/dashboards/staff")
    DashboardService.StaffDashboard staff(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return dashboards.staff(termId, block);
    }

    @GetMapping("/dashboards/manager")
    DashboardService.ManagerDashboard manager(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return dashboards.manager(termId, block);
    }

    @GetMapping("/dashboards/term")
    TermDashboardService.TermDashboard term(@RequestParam(required = false) Long termId) {
        return termDashboard.dashboard(termId);
    }

    @GetMapping("/dashboards/admin")
    DashboardService.AdminDashboard admin(@RequestParam(required = false) Long termId) {
        return dashboards.admin(termId);
    }

    @GetMapping("/approvals/summary")
    DashboardService.ApprovalCounts approvals(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return dashboards.approvals(termId, block);
    }

    @GetMapping("/reports/occupancy")
    ReportService.Occupancy occupancy(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return reports.occupancy(termId, block);
    }

    @GetMapping("/reports/financial")
    ReportService.Financial financial(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return reports.financial(termId, block);
    }

    @GetMapping("/reports/block")
    ReportService.BlockReport block(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return reports.block(termId, block);
    }

    /** The same filters as the screen, as query parameters. */
    @GetMapping("/exports/{report}")
    ResponseEntity<byte[]> export(@PathVariable String report, @RequestParam Map<String, String> filters) {
        ExportService.File file = exports.export(report, filters);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(file.fileName()).build().toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(file.content());
    }
}
