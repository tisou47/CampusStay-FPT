package vn.fpt.campusstay.service.assignment;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.NextTermAllocationCancelled;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.service.billing.Billing;
import vn.fpt.campusstay.service.inventory.Inventory;
import vn.fpt.campusstay.service.setting.Parameters;
import vn.fpt.campusstay.service.setting.TermCatalog;

/**
 * Implements {@link Stays} on {@code asg_stay}, {@code asg_renewal} and the next-Term Allocations of
 * {@code asg_allocation}. Also the Assignment-internal steps of a Stay: it starts when the student becomes a
 * resident, counts a Term when the next-Term fee is paid and ends at the last check-out.
 */
@Component
class JdbcStays implements Stays {

    private final JdbcClient jdbc;
    private final TermCatalog terms;
    private final Inventory inventory;
    private final Applications applications;
    private final Parameters parameters;
    private final Billing billing;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    JdbcStays(JdbcClient jdbc, TermCatalog terms, Inventory inventory, Applications applications, Parameters parameters,
            Billing billing, ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.terms = terms;
        this.inventory = inventory;
        this.applications = applications;
        this.parameters = parameters;
        this.billing = billing;
        this.events = events;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- windows

    private record Progress(Instant openedAt, Instant closedAt, Instant feesIssuedAt) {
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Window> window(long termId) {
        return terms.renewal(termId).map(r -> window(r, progress(List.of(r.termId())).get(r.termId())));
    }

    @Override
    @Transactional(readOnly = true)
    public List<Window> openWindows() {
        LocalDate today = LocalDate.now(clock.withZone(TimeConfig.CAMPUS_ZONE));
        List<TermCatalog.Renewal> renewals = terms.renewals().stream().filter(r -> r.stayStart().isAfter(today)).toList();
        Map<Long, Progress> progress = progress(renewals.stream().map(TermCatalog.Renewal::termId).toList());
        return renewals.stream().filter(r -> progress.containsKey(r.termId()))
                .map(r -> window(r, progress.get(r.termId()))).toList();
    }

    private Map<Long, Progress> progress(List<Long> termIds) {
        Map<Long, Progress> result = new HashMap<>();
        if (termIds.isEmpty()) {
            return result;
        }
        jdbc.sql("SELECT term_id, opened_at, closed_at, fees_issued_at FROM asg_renewal WHERE term_id IN (:terms)")
                .param("terms", termIds)
                .query((rs, i) -> Map.entry(rs.getLong("term_id"), new Progress(at(rs, "opened_at"), at(rs, "closed_at"),
                        at(rs, "fees_issued_at"))))
                .list().forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    private static Window window(TermCatalog.Renewal r, Progress p) {
        return new Window(r.termId(), r.name(), r.code(), r.stayStart(), r.checkInStart(), r.previousTermId(),
                r.previousName(),
                r.previousCheckOutBy(), r.requestsOpenAt(), r.requestsCloseAt(), r.decisionsDueAt(),
                r.reconciliationDueAt(), r.feesIssueAt(), r.feesDueAt(), p == null ? null : p.openedAt(),
                p == null ? null : p.closedAt(), p == null ? null : p.feesIssuedAt());
    }

    // ---------------------------------------------------------------- next-Term Allocations

    private static final String NEXT_TERM = """
            SELECT a.id, a.term_id, a.student_id, a.stay_id, a.renewal, a.fee_paid_at, s.committed_terms, s.terms_used
            FROM asg_allocation a JOIN asg_stay s ON s.id = a.stay_id
            WHERE a.status = 'ACTIVE' AND a.renewal IS NOT NULL
            """;

    @Override
    @Transactional(readOnly = true)
    public Optional<NextTerm> nextTerm(long studentId, long termId) {
        return jdbc.sql(NEXT_TERM + " AND a.student_id = :s AND a.term_id = :t").param("s", studentId).param("t", termId)
                .query(JdbcStays::nextTerm).optional();
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, NextTerm> nextTerms(Collection<Long> allocationIds) {
        Map<Long, NextTerm> result = new HashMap<>();
        if (allocationIds.isEmpty()) {
            return result;
        }
        jdbc.sql(NEXT_TERM + " AND a.id IN (:ids)").param("ids", List.copyOf(allocationIds)).query(JdbcStays::nextTerm)
                .list().forEach(n -> result.put(n.allocationId(), n));
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public List<NextTerm> ofRoom(long roomId, long termId) {
        List<Long> beds = inventory.bedsOfRoom(roomId).stream().map(Inventory.BedSlot::bedId).toList();
        if (beds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql(NEXT_TERM + " AND a.term_id = :t AND a.bed_id IN (:beds) ORDER BY a.id").param("t", termId)
                .param("beds", beds).query(JdbcStays::nextTerm).list();
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> continuingStudents(long termId) {
        return Set.copyOf(jdbc.sql("""
                SELECT student_id FROM asg_allocation WHERE term_id = :t AND status = 'ACTIVE' AND renewal IS NOT NULL
                """).param("t", termId).query(Long.class).list());
    }

    @Override
    @Transactional(readOnly = true)
    public List<Long> allocationsOnBeds(long termId, Collection<Long> bedIds) {
        if (bedIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                SELECT id FROM asg_allocation WHERE term_id = :t AND status = 'ACTIVE' AND bed_id IN (:beds) ORDER BY id
                """).param("t", termId).param("beds", List.copyOf(bedIds)).query(Long.class).list();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<StayView> stayOf(long studentId) {
        return jdbc.sql("""
                SELECT id, first_term_id, committed_terms, terms_used, status, started_at FROM asg_stay
                WHERE student_id = :s ORDER BY (status = 'ACTIVE') DESC, started_at DESC LIMIT 1
                """).param("s", studentId)
                .query((rs, i) -> new StayView(rs.getLong("id"), rs.getLong("first_term_id"), rs.getInt("committed_terms"),
                        rs.getInt("terms_used"), rs.getString("status"), at(rs, "started_at")))
                .optional();
    }

    @Override
    public int maxStayTerms() {
        return Math.max(1, parameters.intValue("stay.max_terms"));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void extend(long allocationId, int extraTerms) {
        NextTerm n = lockNextTerm(allocationId);
        if (n.committedTerms() + extraTerms > maxStayTerms()) {
            throw ApiException.conflict("STAY_TOO_LONG", "A stay can be at most " + maxStayTerms() + " Terms.");
        }
        jdbc.sql("UPDATE asg_stay SET committed_terms = committed_terms + :k, version = version + 1 WHERE id = :id")
                .param("k", extraTerms).param("id", n.stayId()).update();
        jdbc.sql("""
                UPDATE asg_allocation SET renewal = 'CONTINUING', version = version + 1
                WHERE id = :id AND renewal = 'AWAITING_EXTENSION'
                """).param("id", allocationId).update();
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean endAfterThisTerm(long allocationId) {
        return cancel(allocationId, "END_OF_STAY");
    }

    // ---------------------------------------------------------------- Assignment-internal steps

    /**
     * Cancels a next-Term Allocation (its Bed is free for the next Term) and tells the other features.
     *
     * @param reason an end reason of {@link NextTermAllocationCancelled}
     * @return whether it was still active
     */
    @Transactional(propagation = Propagation.MANDATORY)
    boolean cancel(long allocationId, String reason) {
        record Held(long id, long termId, long studentId, long bedId) {
        }
        Optional<Held> held = jdbc.sql("""
                UPDATE asg_allocation SET status = 'CANCELLED', ended_at = :now, end_reason = :reason, version = version + 1
                WHERE id = :id AND status = 'ACTIVE' AND renewal IS NOT NULL
                RETURNING id, term_id, student_id, bed_id
                """).param("now", Timestamp.from(Instant.now(clock))).param("reason", reason).param("id", allocationId)
                .query((rs, i) -> new Held(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("student_id"),
                        rs.getLong("bed_id")))
                .optional();
        held.ifPresent(h -> {
            Optional<TermCatalog.Renewal> renewal = terms.renewal(h.termId());
            Inventory.BedSlot bed = inventory.beds(h.termId(), List.of(h.bedId())).get(h.bedId());
            settleFee(h.id(), reason, bed == null ? "" : bed.roomCode());
            events.publishEvent(new NextTermAllocationCancelled(h.id(), h.studentId(), h.termId(),
                    renewal.map(TermCatalog.Renewal::name).orElse(""), bed == null ? "" : bed.roomCode(), reason,
                    renewal.map(TermCatalog.Renewal::previousCheckOutBy).orElse(null)));
        });
        return held.isPresent();
    }

    /** Refund rule of a paid next-Term fee whose Bed was released before the Term: nothing of it was used. */
    private static final Map<String, String> FEE_REFUND_RULES = Map.of("NOT_ENROLLED", "NOT_ENROLLED", "TERMINATED",
            "TERMINATION", "END_OF_STAY", "CANCEL_BEFORE_RESULTS");

    /**
     * The next-Term fee of a released Bed: void while unpaid (no claim waiting); a paid one is refunded once, by the
     * rule of why the Bed was released (Not enrolled, Termination; a student who leaves early: Cancel before results).
     */
    private void settleFee(long allocationId, String reason, String room) {
        Billing.InvoiceLine fee = billing.termFees(List.of(allocationId)).get(allocationId);
        if (fee == null || billing.voidUnpaid(fee.id(), "Bed for the next Term released") || !billing.isPaid(fee.id())) {
            return;
        }
        String rule = FEE_REFUND_RULES.get(reason);
        if (rule != null) {
            billing.requestRefund(fee.id(), "TERMINATION", allocationId, "Next-Term fee · Room " + room
                    + " · Bed released before the Term", rule);
        }
    }

    /**
     * The Allocation's student became a resident: their Stay starts (Gia hạn from the Application, 1 without one), or
     * the Allocation joins the Stay they already have. Runs in the caller's transaction.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    void joinStay(long allocationId, Instant residentAt) {
        record Row(long id, long termId, long studentId, Long applicationId, Long stayId) {
        }
        Row a = jdbc.sql("SELECT id, term_id, student_id, application_id, stay_id FROM asg_allocation WHERE id = :id")
                .param("id", allocationId)
                .query((rs, i) -> new Row(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("student_id"),
                        rs.getObject("application_id", Long.class), rs.getObject("stay_id", Long.class)))
                .optional().orElse(null);
        if (a == null || a.stayId() != null) {
            return;
        }
        Long stay = jdbc.sql("SELECT id FROM asg_stay WHERE student_id = :s AND status = 'ACTIVE' FOR UPDATE")
                .param("s", a.studentId()).query(Long.class).optional().orElse(null);
        if (stay == null) {
            int committed = a.applicationId() == null ? 1
                    : applications.find(a.applicationId()).map(Applications.Candidate::stayTerms).orElse(1);
            stay = jdbc.sql("""
                    INSERT INTO asg_stay (student_id, first_term_id, last_term_id, committed_terms, terms_used, started_at)
                    VALUES (:s, :t, :t, :committed, 1, :at) RETURNING id
                    """).param("s", a.studentId()).param("t", a.termId()).param("committed", Math.max(1, committed))
                    .param("at", Timestamp.from(residentAt)).query(Long.class).single();
        }
        jdbc.sql("UPDATE asg_allocation SET stay_id = :stay WHERE id = :id").param("stay", stay).param("id", a.id())
                .update();
    }

    /** The next-Term room fee of the Allocation was paid: the Stay counts the next Term (spec §6.10 step 6). */
    @Transactional(propagation = Propagation.MANDATORY)
    void feePaid(long allocationId, Instant paidAt) {
        record Row(long termId, long stayId) {
        }
        jdbc.sql("""
                UPDATE asg_allocation SET fee_paid_at = :paid, renewal = 'CONTINUING', version = version + 1
                WHERE id = :id AND status = 'ACTIVE' AND renewal IS NOT NULL AND fee_paid_at IS NULL
                RETURNING term_id, stay_id
                """).param("paid", Timestamp.from(paidAt)).param("id", allocationId)
                .query((rs, i) -> new Row(rs.getLong("term_id"), rs.getLong("stay_id"))).optional()
                .ifPresent(r -> jdbc.sql("""
                        UPDATE asg_stay SET terms_used = terms_used + 1, last_term_id = :t, version = version + 1
                        WHERE id = :id
                        """).param("t", r.termId()).param("id", r.stayId()).update());
    }

    /**
     * The student checked out (or was moved out) and holds no other Allocation: the Stay ends, completed when every
     * committed Term was used, else ended early; a termination ends it as terminated.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    void endIfLeft(long studentId, boolean terminated) {
        long holding = jdbc.sql("SELECT count(*) FROM asg_allocation WHERE student_id = :s AND status = 'ACTIVE'")
                .param("s", studentId).query(Long.class).single();
        if (holding > 0) {
            return;
        }
        jdbc.sql("""
                UPDATE asg_stay SET status = 'ENDED', ended_at = :now, version = version + 1,
                       end_kind = CASE WHEN :terminated THEN 'TERMINATED'
                                       WHEN terms_used >= committed_terms THEN 'COMPLETED' ELSE 'ENDED_EARLY' END
                WHERE student_id = :s AND status = 'ACTIVE'
                """).param("now", Timestamp.from(Instant.now(clock))).param("terminated", terminated)
                .param("s", studentId).update();
    }

    /** Allocation ids of the Stay of an Allocation (every Term and move), the Allocation alone without a Stay. */
    @Transactional(readOnly = true)
    List<Long> allocationsOfStay(long allocationId) {
        return jdbc.sql("""
                SELECT a.id FROM asg_allocation a
                WHERE a.id = :id OR a.stay_id = (SELECT stay_id FROM asg_allocation WHERE id = :id)
                ORDER BY a.id
                """).param("id", allocationId).query(Long.class).list();
    }

    private NextTerm lockNextTerm(long allocationId) {
        jdbc.sql("SELECT id FROM asg_allocation WHERE id = :id FOR UPDATE").param("id", allocationId)
                .query(Long.class).optional();
        return jdbc.sql(NEXT_TERM + " AND a.id = :id").param("id", allocationId).query(JdbcStays::nextTerm).optional()
                .orElseThrow(() -> ApiException.conflict("NO_NEXT_TERM_BED", "This student has no Bed for the next Term."));
    }

    private static NextTerm nextTerm(ResultSet rs, int i) throws SQLException {
        return new NextTerm(rs.getLong("id"), rs.getLong("term_id"), rs.getLong("student_id"), rs.getLong("stay_id"),
                rs.getString("renewal"), rs.getTimestamp("fee_paid_at") != null, rs.getInt("committed_terms"),
                rs.getInt("terms_used"));
    }

    private static Instant at(ResultSet rs, String column) throws SQLException {
        Timestamp t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
