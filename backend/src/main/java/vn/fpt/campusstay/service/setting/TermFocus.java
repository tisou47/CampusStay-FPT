package vn.fpt.campusstay.service.setting;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.service.setting.StudentTerms;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.config.TimeConfig;

/**
 * Which Term a student's app shows by default ({@code current} in {@code GET /terms}):
 * the Term of their Allocation while its stay runs, else the latest Term they
 * applied for that has not ended, else the Term open for registration, else the
 * general current Term. Back-office users keep the general rule.
 */
@Component
public class TermFocus {

    private final ObjectProvider<StudentTerms> studentTerms;
    private final Clock clock;

    TermFocus(ObjectProvider<StudentTerms> studentTerms, Clock clock) {
        this.studentTerms = studentTerms;
        this.clock = clock;
    }

    public List<TermSummary> forStudent(long studentId, List<TermSummary> terms) {
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        Map<Long, TermSummary> byId = terms.stream().collect(Collectors.toMap(TermSummary::id, Function.identity()));
        StudentTerms source = studentTerms.getIfAvailable();
        List<StudentTerms.LiveApplication> live = source == null ? List.of() : source.liveApplications(studentId);

        Optional<TermSummary> pick = live.stream()
                .filter(StudentTerms.LiveApplication::allocated)
                .map(a -> byId.get(a.termId()))
                .filter(t -> t != null && !today.isBefore(t.stayStart()) && !today.isAfter(t.stayEnd()))
                .findFirst();
        if (pick.isEmpty()) {
            pick = live.stream()
                    .map(a -> byId.get(a.termId()))
                    .filter(t -> t != null && !today.isAfter(t.stayEnd()))
                    .max(Comparator.comparing(TermSummary::stayStart));
        }
        if (pick.isEmpty()) {
            pick = terms.stream().filter(TermSummary::registrationOpen).findFirst();
        }
        if (pick.isEmpty()) {
            return terms;
        }
        long focus = pick.get().id();
        return terms.stream().map(t -> t.withCurrent(t.id() == focus)).toList();
    }
}
