package vn.fpt.campusstay.app.internal;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.app.Applications;

/** Implements {@link Applications} for the assignment engine. */
@Component
class JdbcApplications implements Applications {

    private final JdbcClient jdbc;
    private final ApplicationStore applications;
    private final JsonMapper json;

    JdbcApplications(JdbcClient jdbc, ApplicationStore applications, JsonMapper json) {
        this.jdbc = jdbc;
        this.applications = applications;
        this.json = json;
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
    @Transactional(propagation = Propagation.MANDATORY)
    public void allocated(long applicationId, String room, String bed) {
        if (applications.transition(applicationId, Set.of("APPROVED", "WAITLISTED"), "ALLOCATED")) {
            applications.event(applicationId, "ALLOCATED", "Room and Bed assigned", room + " · Bed " + bed, null);
        }
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
