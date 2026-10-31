package vn.fpt.campusstay.service.notification;

import java.text.NumberFormat;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.event.AllocationForfeited;
import vn.fpt.campusstay.event.LateCheckInDecided;
import vn.fpt.campusstay.event.PaymentClaimRejected;
import vn.fpt.campusstay.event.PaymentClaimsWaiting;
import vn.fpt.campusstay.event.PaymentDueSoon;
import vn.fpt.campusstay.event.UtilityWarningIssued;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.event.InvoiceOverdue;
import vn.fpt.campusstay.event.RefundAccountReminded;
import vn.fpt.campusstay.event.RefundDecided;
import vn.fpt.campusstay.config.TimeConfig;

/**
 * Money (spec §10): overdue Invoices, refunds, late check-in decisions, payment claims (rejected or cancelled for the
 * student, the hourly summary for Managers), payment reminders, forfeits and Utility warnings. In-app (and push); a
 * reminder, a forfeit and the Utility warnings also go out by email through the outbox, in the student's language.
 */
@Component
class FinanceNotificationListener {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy")
            .withZone(TimeConfig.CAMPUS_ZONE);
    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
            .withZone(TimeConfig.CAMPUS_ZONE);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

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
                    "PAYMENT_REMINDER", p.email(), users.locale(e.studentId()), Map.of("name", p.name(), "title", e.title(), "amount", vnd(e.amount()),
                            "dueAt", DAY.format(e.dueAt()))));
        }
    }

    @EventListener
    void on(RefundDecided e) {
        notifier.notify(e.studentId(), "REFUND_DECIDED", Map.of("amount", vnd(e.amount()), "decision", e.decision()),
                "/student/invoices");
    }

    @EventListener
    void on(RefundAccountReminded e) {
        notifier.notify(e.studentId(), "REFUND_ACCOUNT_REMINDER",
                Map.of("amount", vnd(e.amount()), "reason", sentence(e.reason())), "/student/invoices");
    }

    @EventListener
    void on(LateCheckInDecided e) {
        notifier.notify(e.studentId(), "LATE_CHECK_IN_DECIDED", Map.of("decision", e.decision()), "/student/room");
    }

    @EventListener
    void on(PaymentClaimRejected e) {
        if (e.cancelled()) {
            notifier.notify(e.studentId(), "PAYMENT_CLAIM_CANCELLED",
                    Map.of("title", e.title(), "count", String.valueOf(e.rejected())), "/student/invoices");
            return;
        }
        notifier.notify(e.studentId(), "PAYMENT_CLAIM_REJECTED", Map.of("title", e.title(), "amount", vnd(e.amount()),
                "reason", sentence(e.reason()), "dueAt", WHEN.format(e.dueAt())),
                "/student/invoices/" + e.invoiceCode() + "/pay");
    }

    @EventListener
    void on(PaymentClaimsWaiting e) {
        Map<String, String> values = Map.of("count", String.valueOf(e.count()), "total", vnd(e.total()));
        users.activeUserIds("MANAGER").forEach(u -> notifier.notify(u, "PAYMENT_CLAIMS_WAITING", values,
                "/manager/payment-claims"));
    }

    @EventListener
    void on(PaymentDueSoon e) {
        notifier.notify(e.studentId(), "TERM_FEE".equals(e.type()) ? "NEXT_TERM_FEE_DUE_SOON" : "PAYMENT_DUE_SOON",
                Map.of("title", e.title(), "amount", vnd(e.amount()), "dueAt", WHEN.format(e.dueAt())),
                "/student/invoices/" + e.invoiceCode() + "/pay");
        email(e.studentId(), "PAYMENT_REMINDER", Map.of("title", e.title(), "amount", vnd(e.amount()),
                "dueAt", WHEN.format(e.dueAt())));
    }

    @EventListener
    void on(AllocationForfeited e) {
        Map<String, String> values = Map.of("room", e.room(), "dueAt", WHEN.format(e.dueAt()), "refund", vnd(e.refund()));
        notifier.notify(e.studentId(), "BALANCE_FORFEITED", values, "/student/applications");
        email(e.studentId(), "BALANCE_FORFEITED", values);
    }

    @EventListener
    void on(UtilityWarningIssued e) {
        if (e.level().equals("FINAL")) {
            Map<String, String> values = Map.of("debt", vnd(e.debt()), "terminateOn", DATE.format(e.terminateOn()));
            notifier.notify(e.studentId(), "UTILITY_FINAL_WARNING", values, "/student/invoices");
            email(e.studentId(), "UTILITY_FINAL_WARNING", values);
            return;
        }
        Map<String, String> values = Map.of("title", e.title(), "amount", vnd(e.amount()),
                "months", String.valueOf(e.months()));
        notifier.notify(e.studentId(), "UTILITY_WARNING", values, "/student/invoices/" + e.invoiceCode() + "/pay");
        email(e.studentId(), "UTILITY_WARNING", values);
    }

    /** An email in the student's language; the student's name fills {@code {{name}}}. */
    private void email(long studentId, String template, Map<String, String> values) {
        users.studentProfile(studentId).filter(p -> p.email() != null).ifPresent(p -> {
            Map<String, String> all = new HashMap<>(values);
            all.put("name", p.name());
            outbox.enqueue(template, p.email(), users.locale(studentId), all);
        });
    }

    private static String vnd(long amount) {
        return NumberFormat.getIntegerInstance(Locale.US).format(amount) + " VND";
    }

    /** A Manager's text placed inside a template sentence: without its own final full stop. */
    private static String sentence(String text) {
        return text.strip().replaceAll("\\.+$", "");
    }
}
