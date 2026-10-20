package vn.fpt.campusstay.cfg.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.cfg.TermCatalog;
import vn.fpt.campusstay.cfg.TermSummary;
import vn.fpt.campusstay.shared.web.ListResponse;

/** {@code GET /terms} — every signed-in role. */
@RestController
class TermController {

    private final TermCatalog terms;

    TermController(TermCatalog terms) {
        this.terms = terms;
    }

    @GetMapping("/terms")
    ListResponse<TermSummary> list() {
        return ListResponse.of(terms.publishedTerms());
    }
}
