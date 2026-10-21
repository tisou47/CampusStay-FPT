package vn.fpt.campusstay.ntf.internal;

import java.text.NumberFormat;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.asg.LateCheckInDecided;
import vn.fpt.campusstay.auth.UserDirectory;
import vn.fpt.campusstay.bil.InvoiceOverdue;
import vn.fpt.campusstay.bil.RefundDecided;
import vn.fpt.campusstay.shared.time.TimeConfig;

/**
 * Overdue Invoices, refunds and late check-ins: in-app (and push) notices; a
 * reminder the Block Manager sends also goes out by email through the outbox.
 */
@Component
class FinanceNotificationListener {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy")
            .withZone(TimeConfig.CAMPUS_ZONE);

    private final InAppNotifier notifier;
    private final EmailOutbox outbox;
    private final UserDirectory users;

    FinanceNotificationListener(InAppNotifier notifier, EmailOutbox outbox, UserDirectory users) {
        this.notifier = notifier;
        this.outbox = outbox;
        this.users = users;
    }

    @EventListener
    void on(InvoiceOverdue e) {
        Map<String, String> values = Map.of("title", e.title(), "amount", vnd(e.amount()), "dueAt", DAY.format(e.dueAt()));
        notifier.notify(e.studentId(), "INVOICE_OVERDUE", values, "/student/invoices/" + e.code() + "/pay");
        if (e.reminder()) {
            users.studentProfile(e.studentId()).filter(p -> p.email() != null).ifPresent(p -> outbox.enqueue(
                    "PAYMENT_REMINDER", p.email(), Map.of("name", p.name(), "title", e.title(), "amount", vnd(e.amount()),
                            "dueAt", DAY.format(e.dueAt()))));
        }
    }

    @EventListener
    void on(RefundDecided e) {
        notifier.notify(e.studentId(), "REFUND_DECIDED", Map.of("amount", vnd(e.amount()), "decision", e.decision()),
                "/student/invoices");
    }

    @EventListener
    void on(LateCheckInDecided e) {
        notifier.notify(e.studentId(), "LATE_CHECK_IN_DECIDED", Map.of("decision", e.decision()), "/student/room");
    }

    private static String vnd(long amount) {
        return NumberFormat.getIntegerInstance(Locale.US).format(amount) + " VND";
    }
}
