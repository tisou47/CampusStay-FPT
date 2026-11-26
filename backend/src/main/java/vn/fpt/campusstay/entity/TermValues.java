package vn.fpt.campusstay.entity;

import java.time.Instant;
import java.time.LocalDate;

/** The editable fields of a Term; null means "not filled in" (the contract sends empty fields as null). */
public record TermValues(String name, LocalDate stayStart, LocalDate stayEnd, Instant registrationOpensAt,
        Instant registrationClosesAt, Instant resultsPublishedAt, Integer roommateHours, Integer depositHours,
        Instant balanceDueAt, LocalDate checkInStart, LocalDate checkInEnd, LocalDate checkOutBy) {
}
