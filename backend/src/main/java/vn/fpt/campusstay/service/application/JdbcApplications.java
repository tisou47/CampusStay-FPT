package vn.fpt.campusstay.service.application;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.service.application.Applications;
import vn.fpt.campusstay.event.Round2Offered;
import vn.fpt.campusstay.repository.application.ApplicationStore;

/** Implements {@link Applications} for the assignment engine. */
@Component
class JdbcApplications implements Applications {

    private final JdbcClient jdbc;
    private final ApplicationStore applications;
    private final JsonMapper json;
    private final ApplicationEventPublisher events;

    JdbcApplications(JdbcClient jdbc, ApplicationStore applications, JsonMapper json,
            ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.applications = applications;
        this.json = json;
        this.events = events;
    }

    @Override
    @Transactional(readOnly = true)
    public List<Candidate> approved(long termId) {
        List<Long> ids = jdbc.sql("""
                SELECT id FROM app_application WHERE term_id = :term AND status = 'APPROVED' ORDER BY id
                """).param("term", termId).query(Long.class).list();
        return ids.stream().map(id -> applications.find(id, false).orElseThrow()).map(this::candidate).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Candidate> find(long applicationId) {
        return applications.find(applicationId, false).map(this::candidate);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Candidate> find(String idOrCode) {
        return applications.find(idOrCode).map(this::candidate);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, Candidate> find(Collection<Long> applicationIds) {
        Map<Long, Candidate> result = new HashMap<>();
        applicationIds.forEach(id -> applications.find(id, false).ifPresent(a -> result.put(id, candidate(a))));
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Candidate> live(long studentId, long termId) {
        return applications.live(studentId, termId).map(this::candidate);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, String> applicants(long termId) {
        return jdbc.sql("""
                SELECT student_id, status FROM app_application
                WHERE term_id = :term AND status NOT IN ('DRAFT', 'REJECTED', 'CANCELLED', 'EXPIRED')
                """).param("term", termId)
                .query((rs, i) -> Map.entry(rs.getLong("student_id"), rs.getString("status"))).list().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void allocated(long applicationId, String room, String bed) {
        if (applications.transition(applicationId, Set.of("APPROVED", "WAITLISTED"), "ALLOCATED")) {
            applications.event(applicationId, "ALLOCATED", "Room and Bed assigned", room + " · Bed " + bed, null);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> heldRound2Beds(long termId) {
        return Set.copyOf(jdbc.sql("""
                SELECT o.bed_id FROM app_round2_option o
                JOIN app_round2_offer f ON f.id = o.offer_id
                JOIN app_application a ON a.id = f.application_id
                WHERE a.term_id = :term AND o.held
                """).param("term", termId).query(Long.class).list());
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void offerRound2(long applicationId, List<Round2Option> options, Instant expiresAt) {
        ApplicationStore.Application app = applications.find(applicationId, true).orElseThrow();
        jdbc.sql("""
                UPDATE app_round2_option SET held = FALSE
                WHERE offer_id IN (SELECT id FROM app_round2_offer WHERE application_id = :app AND status = 'PENDING')
                """).param("app", applicationId).update();
        jdbc.sql("UPDATE app_round2_offer SET status = 'WITHDRAWN', version = version + 1 WHERE application_id = :app AND status = 'PENDING'")
                .param("app", applicationId).update();
        long offerId = jdbc.sql("""
                INSERT INTO app_round2_offer (application_id, expires_at) VALUES (:app, :expires) RETURNING id
                """).param("app", applicationId).param("expires", Timestamp.from(expiresAt)).query(Long.class).single();
        for (Round2Option o : options) {
            jdbc.sql("""
                    INSERT INTO app_round2_option (offer_id, room_type_id, room_class_id, building_id, bed_id, note,
                                                   fill_rate, term_price, difference)
                    VALUES (:offer, :type, :class, :building, :bed, :note, :fill, :price, :difference)
                    """)
                    .param("offer", offerId).param("type", o.roomTypeId()).param("class", o.roomClassId())
                    .param("building", o.buildingId()).param("bed", o.bedId()).param("note", o.note())
                    .param("fill", o.fillRate()).param("price", o.termPrice()).param("difference", o.difference())
                    .update();
        }
        applications.event(applicationId, app.status(), "Round 2 offer", options.size() + " Room options", null);
        events.publishEvent(new Round2Offered(applicationId, app.studentId(), expiresAt));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void waitlisted(long applicationId, String reason) {
        if (applications.transition(applicationId, Set.of("APPROVED"), "WAITLISTED")) {
            applications.event(applicationId, "WAITLISTED", "Waitlisted", reason, null);
        }
    }

    private Candidate candidate(ApplicationStore.Application a) {
        Map<String, String> preferences = a.preferences() == null ? Map.of()
                : json.readValue(a.preferences(), new TypeReference<Map<String, String>>() {
                });
        return new Candidate(a.id(), a.code(), a.termId(), a.studentId(), a.studentName(), a.studentCode(), a.gender(),
                a.roomTypeId(), a.roomClassId(), a.termPrice(), a.depositAmount(), a.partnerApplicationId(), preferences,
                a.submittedAt(), a.status());
    }
}
