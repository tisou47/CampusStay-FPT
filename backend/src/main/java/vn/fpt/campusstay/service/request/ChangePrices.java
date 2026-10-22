package vn.fpt.campusstay.service.request;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.config.TimeConfig;

/**
 * The price difference of a room change or swap for the days left in the
 * Term: (new Term price − current Term price) × remaining days ÷ Term days,
 * rounded to the pricing step (Admin › System parameters).
 */
@Component
class ChangePrices {

    record Days(long remaining, long term) {
    }

    private final Parameters parameters;
    private final Clock clock;

    ChangePrices(Parameters parameters, Clock clock) {
        this.parameters = parameters;
        this.clock = clock;
    }

    Days days(TermSummary term) {
        long total = ChronoUnit.DAYS.between(term.stayStart(), term.stayEnd()) + 1;
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        LocalDate from = today.isBefore(term.stayStart()) ? term.stayStart() : today;
        long remaining = Math.max(0, Math.min(total, ChronoUnit.DAYS.between(from, term.stayEnd()) + 1));
        return new Days(remaining, total);
    }

    /** Positive: the student pays; negative: the dormitory owes the student. */
    long difference(long newPrice, long currentPrice, TermSummary term) {
        Days d = days(term);
        if (d.term() <= 0 || newPrice == currentPrice) {
            return 0;
        }
        BigDecimal raw = BigDecimal.valueOf(newPrice - currentPrice).multiply(BigDecimal.valueOf(d.remaining()))
                .divide(BigDecimal.valueOf(d.term()), 0, RoundingMode.HALF_UP);
        long step = Math.max(1, parameters.intValue("pricing.rounding_vnd"));
        long rounded = BigDecimal.valueOf(Math.abs(raw.longValue())).divide(BigDecimal.valueOf(step), 0, RoundingMode.HALF_UP)
                .longValue() * step;
        return raw.signum() < 0 ? -rounded : rounded;
    }
}
