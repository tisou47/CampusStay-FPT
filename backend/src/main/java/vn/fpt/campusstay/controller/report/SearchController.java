package vn.fpt.campusstay.controller.report;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.report.SearchService;

/** The back-office search in the top bar (Staff, Managers, Admin). */
@RestController
class SearchController {

    private final SearchService search;

    SearchController(SearchService search) {
        this.search = search;
    }

    @GetMapping("/search")
    SearchService.Results search(@RequestParam(required = false) String q) {
        return search.search(q);
    }
}
