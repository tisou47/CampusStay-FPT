package vn.fpt.campusstay.service.billing;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.audit.Actor;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.PaymentConfirmed;
import vn.fpt.campusstay.event.TerminationStarted;
import vn.fpt.campusstay.event.UtilityTerminationDue;
import vn.fpt.campusstay.event.UtilityWarningIssued;
import vn.fpt.campusstay.service.setting.Parameters;

/**
 * Utility debt (spec §6.14, D-27), worked out from the student's Invoices each time, so running it twice changes
 * nothing. A Utility Invoice overdue without a claim gives <b>warning 1</b>; a new Utility Invoice while one is
 * overdue, two overdue Invoices or a debt reaching the Utility Deposit held gives the <b>final warning</b> with the
 * earliest termination day ({@code termination.days_after_final_warning}). From that day, overdue Invoices ≥
 * {@code termination.overdue_months} or (when {@code termination.debt_reaches_deposit}) the debt ≥ the Utility
 * Deposit held start the termination ({@link UtilityTerminationDue}, Assignment). Paying everything before closes
 * the warnings; an Invoice waiting for its claim's confirmation neither counts nor closes them.
 */
@Component
public class UtilityDebtService {

    private record Overdue(long id, String code, String title, long amount, Long allocationId, Long buildingId,
            long termId) {
    }

    private record Warning(long id, String level, LocalDate terminateOn) {
    }

    private final JdbcClient jdbc;
    private final Parameters parameters;
    private final ApplicationEventPublisher events;
    private final AuditLog audit;
    private final Clock clock;

    UtilityDebtService(JdbcClient jdbc, Parameters parameters, ApplicationEventPublisher events, AuditLog audit,
            Clock clock) {
        this.jdbc = jdbc;
        this.parameters = parameters;
        this.events = events;
        this.audit = audit;
        this.clock = clock;
    }

    /** Hourly, after Invoices became overdue. @return students whose stay the debt now terminates */
    @Transactional
    public int evaluateAll() {
        List<Long> students = jdbc.sql("""
                SELECT student_id FROM bil_invoice WHERE type = 'UTILITY' AND status = 'OVERDUE'
                UNION SELECT student_id FROM bil_utility_warning WHERE closed_at IS NULL
                ORDER BY 1
                """).query(Long.class).list();
        int terminated = 0;
        for (long student : students) {
            if (evaluate(student, null)) {
                terminated++;
            }
        }
        return terminated;
    }

    /** A Utility Invoice was issued: while an earlier one is overdue, this is the final warning. */
    @Transactional(propagation = Propagation.MANDATORY)
    void afterIssued(long studentId, long invoiceId) {
        evaluate(studentId, invoiceId);
    }

    /** Paying a Utility Invoice may close the warnings at once. */
    @EventListener
    void on(PaymentConfirmed e) {
        if (e.type().equals("UTILITY")) {
            evaluate(e.studentId(), null);
        }
    }

    /** A termination for another reason does not need the warnings any more. */
    @EventListener
    void on(TerminationStarted e) {
        close(e.studentId(), "TERMINATED");
    }

    /** @param newInvoiceId a Utility Invoice just issued, else null. @return whether the termination was triggered */
    private boolean evaluate(long studentId, Long newInvoiceId) {
        List<Overdue> overdue = jdbc.sql("""
                SELECT id, code, title, amount, allocation_id, building_id, term_id FROM bil_invoice
                WHERE student_id = :student AND type = 'UTILITY' AND status = 'OVERDUE'
                ORDER BY due_at, id
                """).param("student", studentId)
                .query((rs, i) -> new Overdue(rs.getLong("id"), rs.getString("code"), rs.getString("title"),
                        rs.getLong("amount"), rs.getObject("allocation_id", Long.class),
                        rs.getObject("building_id", Long.class), rs.getLong("term_id")))
                .list();
        if (overdue.isEmpty()) {
            boolean waiting = jdbc.sql("""
                    SELECT count(*) FROM bil_invoice
                    WHERE student_id = :student AND type = 'UTILITY' AND status = 'AWAITING_CONFIRMATION'
                    """).param("student", studentId).query(Long.class).single() > 0;
            if (!waiting) {
                close(studentId, "PAID");
            }
            return false;
        }
        Overdue latest = overdue.getLast();
        Long allocationId = overdue.reversed().stream().map(Overdue::allocationId).filter(a -> a != null).findFirst()
                .orElse(null);
        if (allocationId == null) {
            return false;
        }
        // Once the stay is being terminated (warnings closed as TERMINATED), the debt is settled at check-out:
        // no new warnings and no second termination.
        boolean terminating = jdbc.sql("""
                SELECT count(*) FROM bil_utility_warning WHERE allocation_id = :allocation AND closed_reason = 'TERMINATED'
                """).param("allocation", allocationId).query(Long.class).single() > 0;
        if (terminating) {
            return false;
        }
        long debt = overdue.stream().mapToLong(Overdue::amount).sum();
        // The Utility Deposit is held for the whole Stay (a continuing resident's next Terms have none of their own);
        // a check-out settled every deposit paid before it.
        long held = jdbc.sql("""
                SELECT coalesce(sum(b.utility_deposit), 0) FROM bil_invoice b
                WHERE b.student_id = :student AND b.status = 'PAID' AND b.utility_deposit > 0
                  AND b.paid_at > coalesce((SELECT max(c.created_at) FROM bil_meter_cut c
                                            JOIN bil_invoice x ON x.allocation_id = c.allocation_id
                                            WHERE c.reason = 'CHECK_OUT' AND x.student_id = :student),
                                           '-infinity'::timestamptz)
                """).param("student", studentId).query(Long.class).single();
        int months = Math.max(1, parameters.intValue("termination.overdue_months"));
        boolean debtRule = Boolean.parseBoolean(parameters.textValue("termination.debt_reaches_deposit"));
        boolean debtReached = debtRule && held > 0 && debt >= held;
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        Instant now = Instant.now(clock);

        List<Warning> open = jdbc.sql("""
                SELECT id, level, terminate_on FROM bil_utility_warning WHERE student_id = :student AND closed_at IS NULL
                """).param("student", studentId)
                .query((rs, i) -> new Warning(rs.getLong("id"), rs.getString("level"),
                        rs.getObject("terminate_on", LocalDate.class)))
                .list();
        Optional<Warning> fin = open.stream().filter(w -> w.level().equals("FINAL")).findFirst();
        boolean first = open.stream().anyMatch(w -> w.level().equals("FIRST"));
        boolean finalNeeded = newInvoiceId != null || overdue.size() >= 2 || debtReached;
        if (fin.isEmpty() && finalNeeded) {
            LocalDate terminateOn = today.plusDays(Math.max(0, parameters.intValue("termination.days_after_final_warning")));
            if (!first) {
                insert(allocationId, studentId, latest, overdue.getFirst().id(), "FIRST", overdue.size(), debt, null, now);
            }
            if (insert(allocationId, studentId, latest, newInvoiceId != null ? newInvoiceId : latest.id(), "FINAL",
                    overdue.size(), debt, terminateOn, now)) {
                audit.record(Actor.SYSTEM, "UTILITY_FINAL_WARNING", AuditLog.Tone.WARNING, "Invoice",
                        latest.id(), latest.code(), Map.of("debt", debt, "terminateOn", terminateOn.toString()));
                events.publishEvent(new UtilityWarningIssued("FINAL", studentId, allocationId, latest.code(),
                        latest.title(), latest.amount(), debt, months, terminateOn, now));
            }
            return false;
        }
        if (!first && fin.isEmpty()) {
            Overdue oldest = overdue.getFirst();
            if (insert(allocationId, studentId, latest, oldest.id(), "FIRST", overdue.size(), debt, null, now)) {
                events.publishEvent(new UtilityWarningIssued("FIRST", studentId, allocationId, oldest.code(),
                        oldest.title(), oldest.amount(), debt, months, null, now));
            }
            return false;
        }
        if (fin.isPresent() && !today.isBefore(fin.get().terminateOn()) && (overdue.size() >= months || debtReached)) {
            close(studentId, "TERMINATED");
            audit.record(Actor.SYSTEM, "UTILITY_TERMINATION_TRIGGERED", AuditLog.Tone.DANGER,
                    "Allocation", allocationId, latest.code(), Map.of("debt", debt, "overdue", overdue.size()));
            events.publishEvent(new UtilityTerminationDue(allocationId, studentId, latest.termId(), debt, overdue.size()));
            return true;
        }
        return false;
    }

    private boolean insert(long allocationId, long studentId, Overdue latest, long invoiceId, String level, int count,
            long debt, LocalDate terminateOn, Instant now) {
        return jdbc.sql("""
                INSERT INTO bil_utility_warning (allocation_id, student_id, term_id, building_id, level, invoice_id,
                                                 overdue_count, debt, terminate_on, issued_at)
                VALUES (:allocation, :student, :term, :building, :level, :invoice, :count, :debt, :terminateOn, :now)
                ON CONFLICT (allocation_id, level) WHERE closed_at IS NULL DO NOTHING
                """)
                .param("allocation", allocationId).param("student", studentId).param("term", latest.termId())
                .param("building", latest.buildingId()).param("level", level).param("invoice", invoiceId)
                .param("count", count).param("debt", debt).param("terminateOn", terminateOn)
                .param("now", Timestamp.from(now)).update() > 0;
    }

    private void close(long studentId, String reason) {
        jdbc.sql("""
                UPDATE bil_utility_warning SET closed_at = :now, closed_reason = :reason
                WHERE student_id = :student AND closed_at IS NULL
                """).param("now", Timestamp.from(Instant.now(clock))).param("reason", reason)
                .param("student", studentId).update();
    }
}
