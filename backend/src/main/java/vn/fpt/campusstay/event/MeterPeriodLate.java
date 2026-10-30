package vn.fpt.campusstay.event;

import java.util.List;

/** A month ended {@code days} days ago and its Block's meter period is still open (BIL): its Staff are reminded. */
public record MeterPeriodLate(String block, String period, long days, List<Long> staffIds) {
}
