package vn.fpt.campusstay.service.notification;

import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import vn.fpt.campusstay.event.LateCheckInRequested;
import vn.fpt.campusstay.event.NextTermBedTaken;
import vn.fpt.campusstay.event.TerminationCancelled;
import vn.fpt.campusstay.event.TerminationOverdue;
import vn.fpt.campusstay.event.TerminationStarted;
import vn.fpt.campusstay.service.auth.UserDirectory;

/**
 * Residence (spec §10): Managers hear about late check-ins asked online and terminations past their move-out date
 * (with the Block's Staff); the student about a termination notice (in-app, push and email) and its cancellation.
 */
@Component
class ResidenceNotificationListener {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final InAppNotifier notifier;
    private final EmailOutbox outbox;
    private final UserDirectory users;

    ResidenceNotificationListener(InAppNotifier notifier, EmailOutbox outbox, UserDirectory users) {
        this.notifier = notifier;
        this.outbox = outbox;
        this.users = users;
    }

    @AfterCommit
    void on(LateCheckInRequested e) {
        Map<String, String> values = Map.of("name", e.studentName(), "studentCode", e.studentCode(),
                "requestedFor", DAY.format(e.requestedFor()), "room", e.room() == null ? "-" : e.room());
        users.activeUserIds("MANAGER").forEach(u -> notifier.notify(u, "LATE_CHECK_IN_REQUESTED", values,
                "/manager/approvals/late-check-in"));
    }

    @AfterCommit
    void on(TerminationStarted e) {
        Map<String, String> values = Map.of("room", e.room() == null ? "-" : e.room(), "moveOutBy",
                DAY.format(e.moveOutBy()));
        notifier.notify(e.studentId(), "TERMINATION_NOTICE", values, "/student/room");
        users.studentProfile(e.studentId()).filter(p -> p.email() != null).ifPresent(p -> {
            Map<String, String> all = new HashMap<>(values);
            all.put("name", p.name());
            outbox.enqueue("TERMINATION_NOTICE", p.email(), users.locale(e.studentId()), all);
        });
    }

    @AfterCommit
    void on(NextTermBedTaken e) {
        notifier.notify(e.studentId(), "NEXT_TERM_BED_TAKEN", Map.of("room", e.room(), "term", e.term()),
                "/student/room");
        String name = users.studentProfile(e.studentId()).map(UserDirectory.StudentProfile::name).orElse("-");
        users.activeUserIds("MANAGER").forEach(u -> notifier.notify(u, "NEXT_TERM_BED_TAKEN_MANAGER",
                Map.of("name", name, "room", e.room(), "term", e.term()), "/manager/next-term/requests"));
    }

    @AfterCommit
    void on(TerminationCancelled e) {
        notifier.notify(e.studentId(), "TERMINATION_CANCELLED", Map.of("room", e.room()), "/student/room");
    }

    @AfterCommit
    void on(TerminationOverdue e) {
        Map<String, String> values = Map.of("name", e.studentName() == null ? "-" : e.studentName(), "room", e.room(),
                "moveOutBy", DAY.format(e.moveOutBy()));
        users.activeUserIds("MANAGER").forEach(u -> notifier.notify(u, "TERMINATION_OVERDUE", values,
                "/manager/terminations"));
        List<Long> staff = users.staffOf(List.of(e.buildingId())).stream().map(UserDirectory.StaffMember::userId)
                .filter(id -> !users.activeUserIds("MANAGER").contains(id)).toList();
        staff.forEach(u -> notifier.notify(u, "TERMINATION_OVERDUE", values, "/staff/check-out"));
    }
}
