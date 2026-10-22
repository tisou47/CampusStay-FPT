package vn.fpt.campusstay.service.application;

import java.time.Instant;
import java.time.LocalDate;

import vn.fpt.campusstay.dto.setting.TermSummary;

/** A Term as the student screens show it (same fields as an item of {@code GET /terms}). */
public record TermView(String id, String name, boolean current, boolean registrationOpen, LocalDate stayStart,
        LocalDate stayEnd, Instant registrationOpensAt, Instant registrationClosesAt, Instant resultsPublishedAt,
        Instant balanceDueAt, LocalDate checkInStart, LocalDate checkInEnd, int depositWindowHours) {

    static TermView of(TermSummary t) {
        return t == null ? null
                : new TermView(String.valueOf(t.id()), t.name(), t.current(), t.registrationOpen(), t.stayStart(),
                        t.stayEnd(), t.registrationOpensAt(), t.registrationClosesAt(), t.resultsPublishedAt(),
                        t.balanceDueAt(), t.checkInStart(), t.checkInEnd(), t.depositWindowHours());
    }
}
