package vn.fpt.campusstay.service.request;

import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Component;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.service.assignment.Moves;
import vn.fpt.campusstay.service.assignment.Stays;

/**
 * Where next-Term requests act (spec §6.10): the requests window the student files in, with the next-Term Allocation
 * every change is made on. Students file between M2 and M3; Staff and Managers decide until the next-Term fees are
 * issued (then next-Term Beds are frozen, D-31).
 */
@Component
class NextTermContext {

    /** The student's next-Term Allocation in an open window, with its Bed (its Room's class in the next Term). */
    record Filing(Stays.Window window, Stays.NextTerm nextTerm, Moves.Placement placement) {
    }

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);

    private final Stays stays;
    private final Moves moves;
    private final Clock clock;

    NextTermContext(Stays stays, Moves moves, Clock clock) {
        this.stays = stays;
        this.moves = moves;
        this.clock = clock;
    }

    /** The latest open window in which the student holds a next-Term Allocation. */
    Optional<Filing> of(long studentId) {
        for (Stays.Window w : stays.openWindows()) {
            Optional<Stays.NextTerm> n = stays.nextTerm(studentId, w.termId());
            if (n.isPresent()) {
                Optional<Moves.Placement> p = moves.placement(n.get().allocationId());
                if (p.isPresent()) {
                    return Optional.of(new Filing(w, n.get(), p.get()));
                }
            }
        }
        return Optional.empty();
    }

    /** Like {@link #of(long)}, but the window must accept requests now. */
    Filing filing(long studentId) {
        Filing f = of(studentId).orElseThrow(() -> ApiException.conflict("NO_NEXT_TERM_BED",
                "Next-Term requests open when your Bed is kept for the next Term (the requests window)."));
        if (!f.window().filing(Instant.now(clock))) {
            throw ApiException.conflict("REQUESTS_CLOSED", "Next-Term requests for " + f.window().termName()
                    + " closed on " + WHEN.format(f.window().closesAt()) + ".");
        }
        return f;
    }

    /** The latest open window, for the Staff and Manager queues. */
    Optional<Stays.Window> current() {
        List<Stays.Window> open = stays.openWindows();
        return open.stream().findFirst();
    }

    Optional<Stays.Window> window(long termId) {
        return stays.window(termId);
    }

    /** Decisions are possible until the next-Term fees are issued. */
    void checkDeciding(long termId) {
        Stays.Window w = stays.window(termId).orElseThrow(() -> ApiException.conflict("NO_WINDOW",
                "This request is not part of a requests window."));
        if (!w.deciding()) {
            throw ApiException.conflict("FEES_ISSUED", "The next-Term fees are issued, so next-Term Beds are fixed."
                    + " A Manager can still move a student.");
        }
    }

    static String when(Instant at) {
        return at == null ? "" : WHEN.format(at);
    }
}
