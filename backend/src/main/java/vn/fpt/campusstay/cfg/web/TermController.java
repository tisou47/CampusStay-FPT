package vn.fpt.campusstay.cfg.web;

import java.time.Instant;
import java.time.LocalDate;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.cfg.TermCatalog;
import vn.fpt.campusstay.cfg.TermSummary;
import vn.fpt.campusstay.shared.web.ListResponse;

/** {@code GET /terms} — every signed-in role. */
@RestController
class TermController {

    /** Contract item of {@code GET /terms}; the id is a string (ADR-15). */
    record TermItem(String id, String name, boolean current, boolean registrationOpen, LocalDate stayStart,
            LocalDate stayEnd, Instant registrationOpensAt, Instant registrationClosesAt, Instant resultsPublishedAt,
            Instant balanceDueAt, LocalDate checkInStart, LocalDate checkInEnd, int depositWindowHours) {

        static TermItem of(TermSummary t) {
            return new TermItem(String.valueOf(t.id()), t.name(), t.current(), t.registrationOpen(), t.stayStart(),
                    t.stayEnd(), t.registrationOpensAt(), t.registrationClosesAt(), t.resultsPublishedAt(),
                    t.balanceDueAt(), t.checkInStart(), t.checkInEnd(), t.depositWindowHours());
        }
    }

    private final TermCatalog terms;

    TermController(TermCatalog terms) {
        this.terms = terms;
    }

    @GetMapping("/terms")
    ListResponse<TermItem> list() {
        return ListResponse.of(terms.publishedTerms().stream().map(TermItem::of).toList());
    }
}
