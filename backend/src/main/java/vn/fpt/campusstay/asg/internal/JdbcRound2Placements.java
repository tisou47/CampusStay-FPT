package vn.fpt.campusstay.asg.internal;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.app.Applications;
import vn.fpt.campusstay.app.Round2Placements;
import vn.fpt.campusstay.asg.AllocationCreated;
import vn.fpt.campusstay.bil.Billing;
import vn.fpt.campusstay.cfg.FeePolicy;
import vn.fpt.campusstay.cfg.TermCatalog;
import vn.fpt.campusstay.cfg.TermSummary;
import vn.fpt.campusstay.inv.Inventory;
import vn.fpt.campusstay.shared.error.ApiException;

/** Implements APP's {@link Round2Placements}: the accepted option's Bed becomes an Allocation with its Balance. */
@Component
class JdbcRound2Placements implements Round2Placements {

    private final JdbcClient jdbc;
    private final Applications applications;
    private final Inventory inventory;
    private final TermCatalog terms;
    private final FeePolicy fees;
    private final Billing billing;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    JdbcRound2Placements(JdbcClient jdbc, Applications applications, Inventory inventory, TermCatalog terms,
            FeePolicy fees, Billing billing, ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.applications = applications;
        this.inventory = inventory;
        this.terms = terms;
        this.fees = fees;
        this.billing = billing;
        this.events = events;
        this.clock = clock;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<String> place(long applicationId, long bedId, long termPrice) {
        Applications.Candidate app = applications.find(applicationId).orElseThrow();
        Inventory.BedSlot bed = inventory.beds(List.of(bedId)).get(bedId);
        TermSummary term = terms.findPublished(app.termId()).orElseThrow();
        Instant now = Instant.now(clock);
        long allocationId;
        try {
            allocationId = jdbc.sql("""
                    INSERT INTO asg_allocation (term_id, application_id, student_id, bed_id, source, allocated_at)
                    VALUES (:term, :app, :student, :bed, 'ROUND2', :now) RETURNING id
                    """)
                    .param("term", app.termId()).param("app", applicationId).param("student", app.studentId())
                    .param("bed", bedId).param("now", Timestamp.from(now)).query(Long.class).single();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("BED_TAKEN", "This Bed is no longer free. Ask Staff for another option.");
        }
        applications.allocated(applicationId, bed.roomCode(), bed.bedLabel());
        Optional<Billing.IssuedInvoice> balance = billing.issueBalance(new Billing.BalanceRequest(app.termId(),
                app.studentId(), applicationId, app.code(), allocationId, bed.buildingId(), bed.roomCode(), termPrice,
                app.depositAmount(), now.plus(Duration.ofDays(fees.balanceDays()))));
        events.publishEvent(new AllocationCreated(allocationId, app.studentId(), term.name(), bed.roomCode(),
                bed.bedLabel(), balance.map(Billing.IssuedInvoice::dueAt).orElse(null)));
        return balance.map(Billing.IssuedInvoice::code);
    }
}
