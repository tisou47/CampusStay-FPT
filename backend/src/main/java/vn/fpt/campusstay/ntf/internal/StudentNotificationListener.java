package vn.fpt.campusstay.ntf.internal;

import java.text.NumberFormat;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.app.ApplicationCreated;
import vn.fpt.campusstay.app.ApplicationRejected;
import vn.fpt.campusstay.app.ApplicationSubmitted;
import vn.fpt.campusstay.app.RoommateInvited;
import vn.fpt.campusstay.asg.AllocationCreated;
import vn.fpt.campusstay.bil.PaymentConfirmed;
import vn.fpt.campusstay.mnt.MaintenanceUpdated;
import vn.fpt.campusstay.shared.time.TimeConfig;

/** Turns APP, ASG, BIL and MNT events into the student's in-app notifications (synchronous: same transaction). */
@Component
class StudentNotificationListener {

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy")
            .withZone(TimeConfig.CAMPUS_ZONE);

    private final InAppNotifier notifier;

    StudentNotificationListener(InAppNotifier notifier) {
        this.notifier = notifier;
    }

    @EventListener
    void on(ApplicationCreated e) {
        notifier.notify(e.studentId(), "DEPOSIT_DUE",
                Map.of("amount", vnd(e.depositAmount()), "dueAt", WHEN.format(e.depositDueAt()), "term", e.termName()),
                "/student/invoices/" + e.depositInvoiceCode() + "/pay");
    }

    @EventListener
    void on(RoommateInvited e) {
        notifier.notify(e.inviteeStudentId(), "ROOMMATE_INVITATION",
                Map.of("fromName", e.fromName(), "roomType", e.roomTypeName(), "term", e.termName(),
                        "expiresAt", WHEN.format(e.expiresAt())),
                "/student/roommate-invitation");
    }

    @EventListener
    void on(ApplicationSubmitted e) {
        notifier.notify(e.studentId(), "APPLICATION_SUBMITTED",
                Map.of("term", e.termName(), "resultsAt", day(e.resultsPublishedAt())),
                "/student/applications/" + e.applicationCode());
    }

    @EventListener
    void on(PaymentConfirmed e) {
        notifier.notify(e.studentId(), "PAYMENT_CONFIRMED", Map.of("amount", vnd(e.amount()), "title", e.title()),
                "/student/invoices");
    }

    @EventListener
    void on(ApplicationRejected e) {
        notifier.notify(e.studentId(), "APPLICATION_REJECTED", Map.of("term", e.termName(), "note", e.note()),
                "/student/applications/" + e.applicationCode());
    }

    @EventListener
    void on(AllocationCreated e) {
        notifier.notify(e.studentId(), "ALLOCATION_PUBLISHED",
                Map.of("room", e.room(), "bed", e.bed(), "term", e.termName(), "dueAt",
                        e.balanceDueAt() == null ? "the date shown in Invoices" : WHEN.format(e.balanceDueAt())),
                "/student/room");
    }

    @EventListener
    void on(MaintenanceUpdated e) {
        notifier.notify(e.reporterId(), "MAINTENANCE_UPDATED", Map.of("title", e.title(), "status", e.status()),
                "/student/requests");
    }

    private static String vnd(long amount) {
        return NumberFormat.getIntegerInstance(Locale.US).format(amount) + " VND";
    }

    private static String day(Instant instant) {
        return instant == null ? "" : DAY.format(instant);
    }
}
