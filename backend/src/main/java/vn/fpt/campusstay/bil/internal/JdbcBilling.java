package vn.fpt.campusstay.bil.internal;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.text.NumberFormat;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
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
import vn.fpt.campusstay.auth.UserDirectory;
import vn.fpt.campusstay.bil.Billing;
import vn.fpt.campusstay.bil.InvoiceIssued;
import vn.fpt.campusstay.cfg.FeePolicy;
import vn.fpt.campusstay.cfg.TermCatalog;
import vn.fpt.campusstay.cfg.TermSummary;
import vn.fpt.campusstay.cfg.UtilityPolicy;
import vn.fpt.campusstay.shared.audit.AuditLog;
import vn.fpt.campusstay.shared.time.TimeConfig;

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
    private final Clock clock;

    JdbcBilling(JdbcClient jdbc, InvoiceStore invoices, TermCatalog terms, UserDirectory users, FeePolicy fees,
            PaymentProperties payment, JsonMapper json, AuditLog audit, CheckOutSettlements settlements,
            UtilityPolicy utility, ApplicationEventPublisher events, Clock clock) {
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
        this.clock = clock;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public IssuedInvoice issueDeposit(DepositRequest r) {
        TermSummary term = term(r.termId());
        BigDecimal rate = fees.depositRate();
        String line = "Deposit " + rate.movePointRight(2).stripTrailingZeros().toPlainString() + "% of the Term price "
                + vnd(r.termPrice());
        return insert(new Draft(term, r.studentId(), r.applicationId(), null, null, "DEPOSIT", "Deposit · " + term.name(),
                r.amount(), List.of(Map.of("label", line, "amount", r.amount())), r.dueAt(),
                "Application " + r.applicationCode(), 0));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<IssuedInvoice> issueBalance(BalanceRequest r) {
        long utility = fees.utilityDeposit();
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
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<Long> requestRefund(long invoiceId, String sourceType, long sourceId, String reason,
            String ruleTriggerCode) {
        InvoiceStore.Invoice invoice = invoices.find(invoiceId, true).orElse(null);
        Optional<FeePolicy.RefundRule> rule = fees.refundRule(ruleTriggerCode);
        if (invoice == null || !invoice.status().equals("PAID") || rule.isEmpty()) {
            return Optional.empty();
        }
        long amount = BigDecimal.valueOf(invoice.amount()).multiply(rule.get().refundPercent())
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValueExact();
        boolean automatic = rule.get().approverRole().equals("SYSTEM");
        long id = insertRefund(new RefundDraft(invoice.termId(), invoice.studentId(), invoice.buildingId(), invoice.id(),
                sourceType, sourceId, reason, rule.get().id(), invoice.amount(), amount, automatic));
        audit.record("REFUND_REQUESTED", AuditLog.Tone.INFO, "Invoice", invoice.id(), invoice.code(),
                Map.of("amount", amount, "rule", rule.get().description(), "status", automatic ? "Approved" : "Pending"));
        return Optional.of(id);
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

    /** A monthly Utility Invoice with its meter breakdown (Meter readings › Close period). */
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

    /** Every refund row carries the student snapshot (V17) so lists are searched and scoped without AUTH tables. */
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
                    WHERE id IN (:ids) AND status IN ('UNPAID', 'OVERDUE', 'AWAITING_CONFIRMATION')
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
