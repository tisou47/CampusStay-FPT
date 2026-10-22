package vn.fpt.campusstay.controller.setting;

import java.time.Instant;
import java.time.LocalDate;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.setting.TermFocus;
import vn.fpt.campusstay.dto.ListResponse;

/** {@code GET /terms} — every signed-in role; for a student {@code current} is their own Term (C-19). */
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
    private final TermFocus focus;
    private final CurrentUser currentUser;

    TermController(TermCatalog terms, TermFocus focus, CurrentUser currentUser) {
        this.terms = terms;
        this.focus = focus;
        this.currentUser = currentUser;
    }

    @GetMapping("/terms")
    ListResponse<TermItem> list() {
        var user = currentUser.get();
        var published = user.is(Role.STUDENT) ? focus.forStudent(user.userId(), terms.publishedTerms())
                : terms.publishedTerms();
        return ListResponse.of(published.stream().map(TermItem::of).toList());
    }
}
