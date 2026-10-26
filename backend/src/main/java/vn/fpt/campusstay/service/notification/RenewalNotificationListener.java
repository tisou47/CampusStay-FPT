package vn.fpt.campusstay.service.notification;

import java.text.NumberFormat;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.common.i18n.Messages;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.EndOfStayNotice;
import vn.fpt.campusstay.event.NextTermAllocationCancelled;
import vn.fpt.campusstay.event.NextTermRequestDecided;
import vn.fpt.campusstay.event.RenewalWorkUndecided;
import vn.fpt.campusstay.event.RequestsWindowOpened;
import vn.fpt.campusstay.event.ResidentMoved;
import vn.fpt.campusstay.event.RoomClassConsentAsked;
import vn.fpt.campusstay.service.auth.UserDirectory;

/**
 * The Term transition (spec §10): the requests window (where a continuing resident stays, the last Term of a Stay),
 * consents asked, next-Term requests decided, a next-Term Bed released, the end-of-stay notice, an operational move
 * and the Managers' alert before the decision deadline. In-app (and push); a released Bed and the end-of-stay notice
 * also go by email, in the student's language. Same transaction as the change.
 */
@Component
class RenewalNotificationListener {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);
    /** Why a next-Term Bed was released, as the notification says it (translated with the catalog). */
    private static final Map<String, String> WHY = Map.of(
            "NOT_EXTENDED", "the stay was not extended by the request deadline",
            "FEE_NOT_PAID", "the next-Term fee was not paid by its deadline",
            "NOT_ENROLLED", "you are not enrolled for the Term",
            "TERMINATED", "your stay was terminated");

    private final InAppNotifier notifier;
    private final EmailOutbox outbox;
    private final UserDirectory users;
    private final Messages messages;

    RenewalNotificationListener(InAppNotifier notifier, EmailOutbox outbox, UserDirectory users, Messages messages) {
        this.notifier = notifier;
        this.outbox = outbox;
        this.users = users;
        this.messages = messages;
    }

    @EventListener
    void on(RequestsWindowOpened e) {
        for (RequestsWindowOpened.Continuing s : e.students()) {
            if (s.termsLeft() > 0) {
                notifier.notify(s.studentId(), "REQUESTS_WINDOW_OPEN", Map.of("room", s.room(), "term", e.termName(),
                        "left", String.valueOf(s.termsLeft()), "closesAt", WHEN.format(e.closesAt())), "/student/room");
            } else {
                notifier.notify(s.studentId(), "STAY_LAST_TERM", Map.of("room", s.room(), "term", e.termName(),
                        "closesAt", WHEN.format(e.closesAt())), "/student/room");
            }
        }
    }

    /** The student asked for the end of the stay: My Room says it; otherwise they are told why (also by email). */
    @EventListener
    void on(NextTermAllocationCancelled e) {
        String why = WHY.get(e.reason());
        if (why == null) {
            return;
        }
        Map<String, String> values = new HashMap<>(Map.of("term", e.termName(), "room", e.room(), "why", why,
                "checkOutBy", e.checkOutBy() == null ? "-" : DAY.format(e.checkOutBy())));
        notifier.notify(e.studentId(), "NEXT_TERM_CANCELLED", values, "/student/room");
        email(e.studentId(), "NEXT_TERM_CANCELLED", values, "why");
    }

    @EventListener
    void on(NextTermRequestDecided e) {
        for (long student : e.studentIds()) {
            notifier.notify(student, "NEXT_TERM_REQUEST_DECIDED", Map.of("kind", e.kind(), "decision", e.decision(),
                    "note", e.note() == null ? "" : e.note()), "/student/requests");
        }
    }

    @EventListener
    void on(RoomClassConsentAsked e) {
        for (long student : e.studentIds()) {
            notifier.notify(student, "ROOM_CLASS_CONSENT_ASKED", Map.of("name", e.requesterName() == null ? "-"
                    : e.requesterName(), "room", e.room(), "from", e.fromClass(), "to", e.toClass(), "term",
                    e.termName()), "/student/requests");
        }
    }

    @EventListener
    void on(EndOfStayNotice e) {
        Map<String, String> values = new HashMap<>(Map.of("term", e.termName(), "block", e.block(),
                "checkOutBy", e.checkOutBy() == null ? "-" : DAY.format(e.checkOutBy()),
                "deskHours", e.deskHours() == null ? "-" : e.deskHours(),
                "held", NumberFormat.getIntegerInstance(Locale.US).format(e.held()) + " VND"));
        notifier.notify(e.studentId(), "END_OF_STAY_NOTICE", values, "/student/room");
        email(e.studentId(), "END_OF_STAY_NOTICE", values, null);
    }

    @EventListener
    void on(ResidentMoved e) {
        notifier.notify(e.studentId(), "RESIDENT_MOVED", Map.of("room", e.room(), "bed", e.bed(), "reason", e.reason()),
                "/student/room");
    }

    @EventListener
    void on(RenewalWorkUndecided e) {
        Map<String, String> values = Map.of("term", e.termName(), "requests", String.valueOf(e.requests()),
                "items", String.valueOf(e.reconciliationItems()), "dueAt", WHEN.format(e.dueAt()));
        users.activeUserIds("MANAGER").forEach(m -> notifier.notify(m, "RENEWAL_UNDECIDED", values,
                "/manager/renewals"));
    }

    /** @param translated a value that is a system sentence: in Vietnamese for a Vietnamese reader */
    private void email(long studentId, String template, Map<String, String> values, String translated) {
        users.studentProfile(studentId).filter(p -> p.email() != null).ifPresent(p -> {
            String locale = users.locale(studentId);
            Map<String, String> all = new HashMap<>(values);
            all.put("name", p.name());
            if (translated != null && all.get(translated) != null) {
                all.put(translated, messages.translate(all.get(translated), locale));
            }
            outbox.enqueue(template, p.email(), locale, all);
        });
    }
}
