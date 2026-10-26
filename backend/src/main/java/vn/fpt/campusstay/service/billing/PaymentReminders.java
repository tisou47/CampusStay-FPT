package vn.fpt.campusstay.service.billing;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.event.PaymentDueSoon;
import vn.fpt.campusstay.repository.billing.InvoiceStore;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * Reminders before a Balance or next-Term fee deadline (spec §5.1 M7, §6.6): {@code payment.reminder_first_days} and
 * {@code payment.reminder_second_days} days before (0 = off), each sent once per Invoice; an Invoice whose claim
 * waits for confirmation is not reminded. A deadline moved later (an approved late check-in) starts them again.
 */
@Component
public class PaymentReminders {

    private record Due(long id, String code, long studentId, String title, long amount, Instant dueAt, int sent,
            String type) {
    }

    private final JdbcClient jdbc;
    private final Parameters parameters;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    PaymentReminders(JdbcClient jdbc, Parameters parameters, ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.parameters = parameters;
        this.events = events;
        this.clock = clock;
    }

    /** @return reminders sent */
    @Transactional
    public int sendDue() {
        int firstDays = Math.max(0, parameters.intValue("payment.reminder_first_days"));
        int secondDays = Math.max(0, parameters.intValue("payment.reminder_second_days"));
        int widest = Math.max(firstDays, secondDays);
        if (widest == 0) {
            return 0;
        }
        Instant now = Instant.now(clock);
        List<Due> due = jdbc.sql("""
                SELECT id, code, student_id, title, amount, due_at, reminders_sent, type FROM bil_invoice
                WHERE type IN ('BALANCE', 'TERM_FEE') AND status = 'UNPAID' AND reminders_sent < 2 AND due_at > :now
                  AND due_at <= :until
                ORDER BY due_at, id FOR UPDATE SKIP LOCKED
                """).param("now", Timestamp.from(now)).param("until", Timestamp.from(now.plus(Duration.ofDays(widest))))
                .query((rs, i) -> new Due(rs.getLong("id"), rs.getString("code"), rs.getLong("student_id"),
                        rs.getString("title"), rs.getLong("amount"), InvoiceStore.instant(rs, "due_at"),
                        rs.getInt("reminders_sent"), rs.getString("type")))
                .list();
        int sent = 0;
        for (Due d : due) {
            Duration left = Duration.between(now, d.dueAt());
            boolean second = secondDays > 0 && left.compareTo(Duration.ofDays(secondDays)) <= 0;
            boolean first = firstDays > 0 && left.compareTo(Duration.ofDays(firstDays)) <= 0;
            int stage = second ? 2 : first ? 1 : 0;
            if (stage <= d.sent()) {
                continue;
            }
            jdbc.sql("UPDATE bil_invoice SET reminders_sent = :stage WHERE id = :id").param("stage", stage)
                    .param("id", d.id()).update();
            events.publishEvent(new PaymentDueSoon(d.id(), d.code(), d.studentId(), d.title(), d.amount(), d.dueAt(),
                    d.type()));
            sent++;
        }
        return sent;
    }
}
