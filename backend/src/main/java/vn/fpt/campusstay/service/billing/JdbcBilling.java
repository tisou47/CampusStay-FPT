package vn.fpt.campusstay.service.billing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.event.InvoiceIssued;
import vn.fpt.campusstay.service.setting.FeePolicy;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.dto.setting.TermSummary;
import vn.fpt.campusstay.service.setting.UtilityPolicy;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.config.PaymentProperties;
import vn.fpt.campusstay.repository.billing.InvoiceStore;

/**
 * Implements {@link Billing}. Invoice code and transfer content come from the
 * row id in the same statement ({@code INV-SP27-000123}, {@code CSTAY000123}),
 * so both are unique without a retry loop.
 */
@Component
class JdbcBilling implements Billing {

    private final JdbcClient jdbc;
    private final InvoiceStore invoices;
    private final TermCatalog terms;
    private final UserDirectory users;
    private final FeePolicy fees;
    private final PaymentProperties payment;
    private final JsonMapper json;
    private final AuditLog audit;
    private final CheckOutSettlements settlements;
    private final UtilityPolicy utility;
    private final ApplicationEventPublisher events;
    private final UtilityDebtService debts;
    private final Clock clock;

    JdbcBilling(JdbcClient jdbc, InvoiceStore invoices, TermCatalog terms, UserDirectory users, FeePolicy fees,
            PaymentProperties payment, JsonMapper json, AuditLog audit, CheckOutSettlements settlements,
            UtilityPolicy utility, ApplicationEventPublisher events, UtilityDebtService debts, Clock clock) {
        this.jdbc = jdbc;
        this.invoices = invoices;
        this.terms = terms;
        this.users = users;
        this.fees = fees;
        this.payment = payment;
        this.json = json;
        this.audit = audit;
        this.settlements = settlements;
        this.utility = utility;
        this.events = events;
        this.debts = debts;
        this.clock = clock;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public IssuedInvoice issueDeposit(DepositRequest r) {
        TermSummary term = term(r.termId());
        BigDecimal rate = fees.depositRate(r.termId());
        String line = "Deposit " + rate.movePointRight(2).stripTrailingZeros().toPlainString() + "% of the Term price "
                + vnd(r.termPrice());
        return insert(new Draft(term, r.studentId(), r.applicationId(), null, null, "DEPOSIT", "Deposit · " + term.name(),
                r.amount(), List.of(Map.of("label", line, "amount", r.amount())), r.dueAt(),
                "Application " + r.applicationCode(), 0));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<IssuedInvoice> issueBalance(BalanceRequest r) {
        long utility = fees.utilityDeposit(r.termId());
        long amount = r.termPrice() - r.depositAmount() + utility;
        if (amount <= 0) {
            return Optional.empty();
        }
        TermSummary term = term(r.termId());
        List<Map<String, Object>> lines = new ArrayList<>(List.of(
                Map.of("label", "Term price · Room " + r.room(), "amount", r.termPrice()),
                Map.of("label", "Deposit already invoiced", "amount", -r.depositAmount())));
        if (utility > 0) {
            lines.add(Map.of("label", "Utility Deposit (held until check-out)", "amount", utility));
        }
        return Optional.of(insert(new Draft(term, r.studentId(), r.applicationId(), r.allocationId(), r.buildingId(),
                "BALANCE", "Balance · " + term.name(), amount, lines, r.dueAt(),
                "Application " + r.applicationCode() + " · Room " + r.room(), utility)));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordMeterCut(long roomId, String room, BigDecimal electricity, BigDecimal water, String reason,
            Long allocationId, long recordedBy, String fieldPrefix) {
        settlements.checkReading(roomId, room, electricity, water, fieldPrefix);
        jdbc.sql("""
                INSERT INTO bil_meter_cut (room_id, cut_date, electricity, water, reason, allocation_id, recorded_by)
                VALUES (:room, :day, :electricity, :water, :reason, :allocation, :by)
                """)
                .param("room", roomId).param("day", LocalDate.ofInstant(Instant.now(clock), TimeConfig.CAMPUS_ZONE))
                .param("electricity", electricity).param("water", water).param("reason", reason)
                .param("allocation", allocationId).param("by", recordedBy).update();
        audit.record("METER_CUT", AuditLog.Tone.INFO, "Room", roomId, "Room " + room,
                Map.of("reason", reason, "electricity", electricity, "water", water));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void followAllocation(long fromAllocationId, long toAllocationId) {
        jdbc.sql("""
                UPDATE bil_invoice SET allocation_id = :to, updated_at = :now, version = version + 1
                WHERE allocation_id = :from AND type IN ('BALANCE', 'TERM_FEE')
                """).param("to", toAllocationId).param("from", fromAllocationId)
                .param("now", Timestamp.from(Instant.now(clock))).update();
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, LocalDate> lastMeterCuts(Collection<Long> roomIds) {
        Map<Long, LocalDate> result = new HashMap<>();
        if (roomIds == null || roomIds.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT room_id, max(cut_date) AS day FROM bil_meter_cut WHERE room_id IN (:rooms) GROUP BY room_id")
                .param("rooms", List.copyOf(roomIds))
                .query((rs, i) -> Map.entry(rs.getLong("room_id"), rs.getObject("day", LocalDate.class))).list()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public IssuedInvoice issueTermFee(TermFeeRequest r) {
        TermSummary term = term(r.termId());
        String title = "Room fee · " + term.name();
        IssuedInvoice issued = insert(new Draft(term, r.studentId(), null, r.allocationId(), r.buildingId(), "TERM_FEE",
                title, r.price(), List.of(Map.of("label", "Room fee · " + term.name() + " · Room " + r.room(),
                        "amount", r.price())), r.dueAt(), "Next-Term fee · Room " + r.room(), 0));
        events.publishEvent(new InvoiceIssued(issued.id(), issued.code(), r.studentId(), title, issued.amount(),
                issued.dueAt()));
        return issued;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, InvoiceLine> termFees(Collection<Long> allocationIds) {
        Map<Long, InvoiceLine> result = new HashMap<>();
        if (allocationIds == null || allocationIds.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT " + InvoiceStore.COLUMNS + """
                 FROM bil_invoice WHERE allocation_id IN (:allocations) AND type = 'TERM_FEE' AND status <> 'VOID'
                """).param("allocations", List.copyOf(allocationIds)).query(InvoiceStore::map).list()
                .forEach(i -> result.put(i.allocationId(), line(i)));
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public List<DueBalance> termFeesPastDue() {
        return jdbc.sql("""
                SELECT id, code, allocation_id, student_id, term_id, due_at FROM bil_invoice
                WHERE type = 'TERM_FEE' AND status IN ('UNPAID', 'OVERDUE') AND due_at < :now AND allocation_id IS NOT NULL
                ORDER BY due_at, id
                """).param("now", Timestamp.from(Instant.now(clock)))
                .query((rs, i) -> new DueBalance(rs.getLong("id"), rs.getString("code"), rs.getLong("allocation_id"),
                        null, rs.getLong("student_id"), rs.getLong("term_id"), InvoiceStore.instant(rs, "due_at"), null))
                .list();
    }

    @Override
    @Transactional(readOnly = true)
    public long utilityDepositHeld(Collection<Long> allocationIds) {
        if (allocationIds == null || allocationIds.isEmpty()) {
            return 0;
        }
        return jdbc.sql("""
                SELECT coalesce(sum(utility_deposit), 0) FROM bil_invoice
                WHERE allocation_id IN (:allocations) AND status = 'PAID'
                """).param("allocations", List.copyOf(allocationIds)).query(Long.class).single();
    }

    private record Draft(TermSummary term, long studentId, Long applicationId, Long allocationId, Long buildingId,
            String type, String title, long amount, List<? extends Map<String, ?>> lines, Instant dueAt,
            String reference, long utilityDeposit) {
    }

    /** One statement: the code and transfer content come from the new row id. */
    private IssuedInvoice insert(Draft d) {
        UserDirectory.StudentProfile student = users.studentProfile(d.studentId())
                .orElseThrow(() -> new IllegalStateException("Invoice for a user who is not a student: " + d.studentId()));
        return jdbc.sql("""
                WITH next AS (SELECT nextval(pg_get_serial_sequence('bil_invoice', 'id')) AS id)
                INSERT INTO bil_invoice (id, code, term_id, student_id, application_id, allocation_id, building_id, type,
                                         title, amount, utility_deposit, status, lines, transfer_content, issued_at, due_at,
                                         reference, student_name, student_code, gender)
                OVERRIDING SYSTEM VALUE
                SELECT id, 'INV-' || :termCode || '-' || lpad(id::text, greatest(6, length(id::text)), '0'),
                       :term, :student, :application, :allocation, :building, :type, :title, :amount, :utility, 'UNPAID',
                       CAST(:lines AS jsonb), :prefix || lpad(id::text, greatest(6, length(id::text)), '0'), :now, :due,
                       :reference, :studentName, :studentCode, :gender
                FROM next
                RETURNING id, code
                """)
                .param("termCode", d.term().code())
                .param("term", d.term().id())
                .param("student", d.studentId())
                .param("application", d.applicationId())
                .param("allocation", d.allocationId())
                .param("building", d.buildingId())
                .param("type", d.type())
                .param("title", d.title())
                .param("amount", d.amount())
                .param("utility", d.utilityDeposit())
                .param("lines", json.writeValueAsString(d.lines()))
                .param("prefix", payment.transferPrefix())
                .param("now", Timestamp.from(Instant.now(clock)))
                .param("due", Timestamp.from(d.dueAt()))
                .param("reference", d.reference())
                .param("studentName", student.name())
                .param("studentCode", student.studentCode())
                .param("gender", student.gender())
                .query((rs, i) -> new IssuedInvoice(rs.getLong("id"), rs.getString("code"), d.amount(), d.dueAt()))
                .single();
    }

    private TermSummary term(long termId) {
        return terms.findPublished(termId)
                .orElseThrow(() -> new IllegalStateException("Invoice for a Term that is not published: " + termId));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean voidUnpaid(long invoiceId, String reason) {
        return jdbc.sql("""
                UPDATE bil_invoice SET status = 'VOID', voided_reason = :reason, updated_at = :now, version = version + 1
                WHERE id = :id AND status IN ('UPCOMING', 'UNPAID', 'OVERDUE')
                """)
                .param("reason", reason).param("now", Timestamp.from(Instant.now(clock))).param("id", invoiceId)
                .update() > 0;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isPaid(long invoiceId) {
        return invoices.find(invoiceId, false).map(i -> i.status().equals("PAID")).orElse(false);
    }

    @Override
    @Transactional(readOnly = true)
    public List<InvoiceLine> invoicesOfApplication(long applicationId) {
        return invoices.ofApplication(applicationId).stream().map(JdbcBilling::line).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, InvoiceLine> depositsOf(Collection<Long> applicationIds) {
        Map<Long, InvoiceLine> result = new HashMap<>();
        if (applicationIds == null || applicationIds.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT " + InvoiceStore.COLUMNS + """
                 FROM bil_invoice WHERE application_id IN (:apps) AND type = 'DEPOSIT' AND status <> 'VOID'
                """).param("apps", List.copyOf(applicationIds)).query(InvoiceStore::map).list()
                .forEach(i -> result.put(i.applicationId(), line(i)));
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, InvoiceLine> invoices(Collection<Long> invoiceIds) {
        Map<Long, InvoiceLine> result = new HashMap<>();
        if (invoiceIds == null || invoiceIds.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT " + InvoiceStore.COLUMNS + " FROM bil_invoice WHERE id IN (:ids)")
                .param("ids", List.copyOf(invoiceIds)).query(InvoiceStore::map).list()
                .forEach(i -> result.put(i.id(), line(i)));
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public DueSummary dueSummary(long studentId, long termId) {
        List<InvoiceStore.Invoice> all = jdbc.sql("SELECT " + InvoiceStore.COLUMNS + """
                 FROM bil_invoice WHERE student_id = :student AND term_id = :term AND status <> 'VOID'
                ORDER BY due_at, id
                """)
                .param("student", studentId).param("term", termId)
                .query(InvoiceStore::map).list();
        List<InvoiceStore.Invoice> due = all.stream()
                .filter(i -> i.status().equals("UNPAID") || i.status().equals("OVERDUE")).toList();
        return new DueSummary(due.size(), all.size(), due.stream().findFirst().map(JdbcBilling::line));
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> withUnpaid(long termId) {
        return Set.copyOf(jdbc.sql("""
                SELECT DISTINCT student_id FROM bil_invoice WHERE term_id = :term AND status IN ('UNPAID', 'OVERDUE')
                """).param("term", termId).query(Long.class).list());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean hasOverdueInvoice(long studentId) {
        return jdbc.sql("SELECT count(*) FROM bil_invoice WHERE student_id = :student AND status = 'OVERDUE'")
                .param("student", studentId).query(Long.class).single() > 0;
    }

    @Override
    @Transactional(readOnly = true)
    public long studentsWithOverdueInvoice() {
        return jdbc.sql("SELECT count(DISTINCT student_id) FROM bil_invoice WHERE status = 'OVERDUE'")
                .query(Long.class).single();
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<RefundRequested> requestRefund(long invoiceId, String sourceType, long sourceId, String reason,
            String ruleTriggerCode) {
        InvoiceStore.Invoice invoice = invoices.find(invoiceId, true).orElse(null);
        Optional<FeePolicy.RefundRule> rule = fees.refundRule(ruleTriggerCode);
        if (invoice == null || !invoice.status().equals("PAID") || rule.isEmpty() || refunded(invoice.id())) {
            return Optional.empty();
        }
        long amount = BigDecimal.valueOf(invoice.amount()).multiply(rule.get().refundPercent())
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValueExact();
        return refund(invoice, sourceType, sourceId, reason, rule.get(), invoice.amount(), amount);
    }

    /** One refund per Invoice (a rejected one does not count); the unique index is the safety net. */
    private boolean refunded(long invoiceId) {
        return jdbc.sql("SELECT count(*) FROM bil_refund WHERE invoice_id = :id AND status <> 'REJECTED'")
                .param("id", invoiceId).query(Long.class).single() > 0;
    }

    /** A rule that gives nothing records nothing. */
    private Optional<RefundRequested> refund(InvoiceStore.Invoice invoice, String sourceType, long sourceId,
            String reason, FeePolicy.RefundRule rule, long base, long amount) {
        if (amount <= 0) {
            return Optional.empty();
        }
        boolean automatic = rule.approverRole().equals("SYSTEM");
        long id = insertRefund(new RefundDraft(invoice.termId(), invoice.studentId(), invoice.buildingId(), invoice.id(),
                sourceType, sourceId, reason, rule.id(), base, amount, automatic));
        audit.record("REFUND_REQUESTED", AuditLog.Tone.INFO, "Invoice", invoice.id(), invoice.code(),
                Map.of("amount", amount, "rule", rule.description(), "status", automatic ? "Approved" : "Pending"));
        return Optional.of(new RefundRequested(id, amount));
    }

    @Override
    @Transactional(readOnly = true)
    public List<DueBalance> balancesPastDue() {
        return jdbc.sql("""
                SELECT b.id, b.code, b.allocation_id, b.application_id, b.student_id, b.term_id, b.due_at,
                       (SELECT d.id FROM bil_invoice d WHERE d.application_id = b.application_id AND d.type = 'DEPOSIT'
                          AND d.status = 'PAID' ORDER BY d.id LIMIT 1) AS deposit_id
                FROM bil_invoice b
                WHERE b.type = 'BALANCE' AND b.status IN ('UNPAID', 'OVERDUE') AND b.due_at < :now
                  AND b.allocation_id IS NOT NULL
                ORDER BY b.due_at, b.id
                """).param("now", Timestamp.from(Instant.now(clock)))
                .query((rs, i) -> new DueBalance(rs.getLong("id"), rs.getString("code"), rs.getLong("allocation_id"),
                        rs.getObject("application_id", Long.class), rs.getLong("student_id"), rs.getLong("term_id"),
                        InvoiceStore.instant(rs, "due_at"), rs.getObject("deposit_id", Long.class)))
                .list();
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean extendBalanceDeadline(long allocationId, Instant dueAt) {
        Instant now = Instant.now(clock);
        return jdbc.sql("""
                UPDATE bil_invoice SET due_at = :due, reminders_sent = 0, updated_at = :now, version = version + 1,
                       status = CASE WHEN status = 'OVERDUE' THEN 'UNPAID' ELSE status END
                WHERE allocation_id = :allocation AND type = 'BALANCE'
                  AND status IN ('UNPAID', 'OVERDUE', 'AWAITING_CONFIRMATION') AND due_at < :due
                """).param("due", Timestamp.from(dueAt)).param("now", Timestamp.from(now))
                .param("allocation", allocationId).update() > 0;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<RefundRequested> refundUnusedRoomFee(UnusedFeeRefund r) {
        Optional<FeePolicy.RefundRule> rule = fees.refundRule(r.ruleTriggerCode());
        List<InvoiceStore.Invoice> paid = jdbc.sql("SELECT " + InvoiceStore.COLUMNS + """
                 FROM bil_invoice
                WHERE status = 'PAID' AND ((type IN ('BALANCE', 'TERM_FEE') AND allocation_id = :allocation)
                   OR (type = 'DEPOSIT' AND application_id = :application))
                ORDER BY id FOR UPDATE
                """).param("allocation", r.allocationId())
                .param("application", r.applicationId() == null ? -1L : r.applicationId())
                .query(InvoiceStore::map).list();
        // The room fee of the Term: its Balance (with the Deposit), or a continuing resident's next-Term fee.
        Optional<InvoiceStore.Invoice> balance = paid.stream()
                .filter(i -> i.type().equals("BALANCE") || i.type().equals("TERM_FEE")).findFirst();
        if (rule.isEmpty() || balance.isEmpty() || refunded(balance.get().id())) {
            return Optional.empty();
        }
        long roomFee = paid.stream().mapToLong(i -> i.amount() - i.utilityDeposit()).sum();
        long stayDays = Math.max(1, ChronoUnit.DAYS.between(r.stayStart(), r.stayEnd()) + 1);
        long unusedDays = Math.max(0, Math.min(stayDays, ChronoUnit.DAYS.between(r.from(), r.stayEnd())));
        long base = BigDecimal.valueOf(roomFee).multiply(BigDecimal.valueOf(unusedDays))
                .divide(BigDecimal.valueOf(stayDays), 0, RoundingMode.HALF_UP).longValueExact();
        long amount = BigDecimal.valueOf(base).multiply(rule.get().refundPercent())
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValueExact();
        return refund(balance.get(), r.sourceType(), r.sourceId(), r.reason(), rule.get(), base, amount);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public IssuedInvoice issueCharge(ChargeRequest r) {
        TermSummary term = term(r.termId());
        IssuedInvoice issued = insert(new Draft(term, r.studentId(), null, r.allocationId(), r.buildingId(), r.type(),
                r.title() + " · " + term.name(), r.amount(),
                r.lines().stream().map(l -> Map.<String, Object>of("label", l.label(), "amount", l.amount())).toList(),
                r.dueAt(), r.reference(), 0));
        events.publishEvent(new InvoiceIssued(issued.id(), issued.code(), r.studentId(), r.title() + " · " + term.name(),
                issued.amount(), issued.dueAt()));
        return issued;
    }

    /** A monthly Utility Invoice with its meter breakdown (Meter readings › Close period); then the debt rules. */
    @Transactional(propagation = Propagation.MANDATORY)
    IssuedInvoice issueUtility(long termId, long studentId, long allocationId, long buildingId, String periodLabel,
            long amount, List<Map<String, Object>> lines, Map<String, Object> breakdown, Instant dueAt, String reference) {
        TermSummary term = term(termId);
        String title = "Utility · " + periodLabel;
        IssuedInvoice issued = insert(new Draft(term, studentId, null, allocationId, buildingId, "UTILITY", title, amount,
                lines, dueAt, reference, 0));
        jdbc.sql("UPDATE bil_invoice SET breakdown = CAST(:breakdown AS jsonb) WHERE id = :id")
                .param("breakdown", json.writeValueAsString(breakdown)).param("id", issued.id()).update();
        events.publishEvent(new InvoiceIssued(issued.id(), issued.code(), studentId, title, amount, dueAt));
        debts.afterIssued(studentId, issued.id());
        return issued;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public long requestCredit(long termId, long studentId, Long buildingId, String sourceType, long sourceId,
            String reason, long amount) {
        long id = insertRefund(new RefundDraft(termId, studentId, buildingId, null, sourceType, sourceId, reason, null,
                amount, amount, false));
        audit.record("REFUND_REQUESTED", AuditLog.Tone.INFO, "Refund", id, reason,
                Map.of("amount", amount, "source", sourceType, "status", "Pending"));
        return id;
    }

    private record RefundDraft(long termId, long studentId, Long buildingId, Long invoiceId, String sourceType,
            long sourceId, String reason, Long ruleId, long paid, long amount, boolean automatic) {
    }

    /** Every refund row carries the student snapshot (V17) so lists are searched and scoped without Auth tables. */
    private long insertRefund(RefundDraft d) {
        UserDirectory.StudentProfile student = users.studentProfile(d.studentId())
                .orElseThrow(() -> new IllegalStateException("Refund for a user who is not a student: " + d.studentId()));
        return jdbc.sql("""
                INSERT INTO bil_refund (term_id, student_id, building_id, invoice_id, source_type, source_id, reason, rule_id,
                                        paid_amount, amount, status, decided_at, student_name, student_code, gender)
                VALUES (:term, :student, :building, :invoice, :sourceType, :sourceId, :reason, :rule, :paid, :amount,
                        :status, :decidedAt, :name, :code, :gender)
                RETURNING id
                """)
                .param("term", d.termId()).param("student", d.studentId()).param("building", d.buildingId())
                .param("invoice", d.invoiceId()).param("sourceType", d.sourceType()).param("sourceId", d.sourceId())
                .param("reason", d.reason()).param("rule", d.ruleId()).param("paid", d.paid()).param("amount", d.amount())
                .param("status", d.automatic() ? "APPROVED" : "PENDING")
                .param("decidedAt", d.automatic() ? Timestamp.from(Instant.now(clock)) : null)
                .param("name", student.name()).param("code", student.studentCode()).param("gender", student.gender())
                .query(Long.class).single();
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, CheckInDue> checkInDues(Collection<Long> allocationIds) {
        return settlements.dues(allocationIds);
    }

    @Override
    @Transactional(readOnly = true)
    public Settlement estimateCheckOut(SettlementRequest request) {
        return settlements.compute(request).settlement();
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public SettledCheckOut settleCheckOut(SettlementRequest r, long recordedBy) {
        if (r.electricity() == null || r.water() == null) {
            throw new IllegalArgumentException("A check-out settlement needs the final meter reading");
        }
        CheckOutSettlements.Computed computed = settlements.compute(r);
        Settlement s = computed.settlement();
        Instant now = Instant.now(clock);
        jdbc.sql("""
                INSERT INTO bil_meter_cut (room_id, cut_date, electricity, water, reason, allocation_id, recorded_by)
                VALUES (:room, :day, :electricity, :water, 'CHECK_OUT', :allocation, :by)
                """)
                .param("room", r.roomId()).param("day", LocalDate.ofInstant(now, TimeConfig.CAMPUS_ZONE))
                .param("electricity", r.electricity()).param("water", r.water()).param("allocation", r.allocationId())
                .param("by", recordedBy).update();
        if (!computed.unpaidUtilityIds().isEmpty()) {
            jdbc.sql("""
                    UPDATE bil_invoice SET status = 'VOID', voided_reason = 'Settled from the Utility Deposit at check-out',
                           updated_at = :now, version = version + 1
                    WHERE id IN (:ids) AND status IN ('UNPAID', 'OVERDUE')
                    """).param("now", Timestamp.from(now)).param("ids", computed.unpaidUtilityIds()).update();
        }
        TermSummary term = term(r.termId());
        Optional<Long> refundId = Optional.empty();
        Optional<IssuedInvoice> invoice = Optional.empty();
        if (s.refund() > 0) {
            refundId = Optional.of(insertRefund(new RefundDraft(r.termId(), r.studentId(), r.buildingId(), null,
                    "CHECK_OUT", r.allocationId(), "Utility Deposit settlement · Room " + r.room(),
                    fees.refundRule("UTILITY_DEPOSIT").map(FeePolicy.RefundRule::id).orElse(null), s.held(), s.refund(),
                    false)));
            audit.record("REFUND_REQUESTED", AuditLog.Tone.INFO, "Allocation", r.allocationId(), "Room " + r.room(),
                    Map.of("amount", s.refund(), "source", "Check-out", "status", "Pending"));
        } else if (s.refund() < 0) {
            List<Map<String, Object>> lines = new ArrayList<>();
            if (s.share() > 0) {
                lines.add(Map.of("label", "Final utility share " + s.periodLabel(), "amount", s.share()));
            }
            if (s.unpaid() > 0) {
                lines.add(Map.of("label", "Unpaid utility Invoices", "amount", s.unpaid()));
            }
            if (s.damage() > 0) {
                lines.add(Map.of("label", "Damage charge", "amount", s.damage()));
            }
            if (s.held() > 0) {
                lines.add(Map.of("label", "Utility Deposit held", "amount", -s.held()));
            }
            invoice = Optional.of(issueCharge(new ChargeRequest(r.termId(), r.studentId(), r.allocationId(), r.buildingId(),
                    "DAMAGE", "Check-out balance", -s.refund(),
                    lines.stream().map(l -> new ChargeLine((String) l.get("label"), ((Number) l.get("amount")).longValue()))
                            .toList(),
                    now.plus(Duration.ofDays(utility.prices().paymentDueDays())), "Check-out · Room " + r.room())));
        }
        return new SettledCheckOut(s, refundId, invoice);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<String> checkOutRefundStatus(long allocationId) {
        return settlements.refundStatus(allocationId);
    }

    static InvoiceLine line(InvoiceStore.Invoice i) {
        return new InvoiceLine(i.id(), i.code(), InvoiceLabels.type(i.type()), i.title(), i.amount(),
                InvoiceLabels.status(i.status()), i.dueAt(), i.paidAt(), InvoiceLabels.method(i.paymentMethod()));
    }

    static String vnd(long amount) {
        return NumberFormat.getIntegerInstance(Locale.US).format(amount) + " VND";
    }
}
