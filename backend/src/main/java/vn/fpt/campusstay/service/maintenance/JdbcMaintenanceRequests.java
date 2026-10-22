package vn.fpt.campusstay.service.maintenance;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.auth.UserDirectory;
import vn.fpt.campusstay.service.maintenance.MaintenanceRequests;
import vn.fpt.campusstay.event.MaintenanceUpdated;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.repository.maintenance.RequestStore;

/** Implements {@link MaintenanceRequests}. */
@Component
@Transactional(readOnly = true)
class JdbcMaintenanceRequests implements MaintenanceRequests {

    private final JdbcClient jdbc;
    private final MaintenanceService labels;
    private final UserDirectory users;
    private final RequestStore requests;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    JdbcMaintenanceRequests(JdbcClient jdbc, MaintenanceService labels, UserDirectory users, RequestStore requests,
            ApplicationEventPublisher events, Clock clock) {
        this.jdbc = jdbc;
        this.labels = labels;
        this.users = users;
        this.requests = requests;
        this.events = events;
        this.clock = clock;
    }

    @Override
    public List<OpenRequest> open(Collection<Long> buildingIds) {
        if (buildingIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                SELECT * FROM mnt_request WHERE building_id IN (:b) AND status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')
                ORDER BY reported_at, id
                """).param("b", List.copyOf(buildingIds)).query(RequestStore::request).list().stream()
                .map(r -> new OpenRequest(r.id(), r.code(), r.termId(), r.buildingId(), r.roomCode(), r.title(),
                        r.category(), r.urgency(), r.status(), r.assigneeId(), r.reportedAt(), r.reopenCount()))
                .toList();
    }

    @Override
    public boolean isOpen(long requestId) {
        return requests.find(String.valueOf(requestId), false).map(RequestStore.Request::open).orElse(false);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void assign(long requestId, long assigneeId, String why) {
        RequestStore.Request r = requests.find(String.valueOf(requestId), true)
                .orElseThrow(() -> ApiException.notFound("This Maintenance Request does not exist."));
        if (!r.open()) {
            throw ApiException.conflict("REQUEST_CLOSED", "This request is no longer open.");
        }
        String status = r.status().equals("SUBMITTED") ? "ASSIGNED" : r.status();
        jdbc.sql("UPDATE mnt_request SET assignee_id = :a, status = :s, version = version + 1 WHERE id = :id")
                .param("a", assigneeId).param("s", status).param("id", r.id()).update();
        String name = users.displayNames(List.of(assigneeId)).get(assigneeId);
        requests.event(r.id(), null, null, "Assigned to " + name + " (" + why + ")", null, false, Instant.now(clock));
        if (r.source().equals("STUDENT")) {
            events.publishEvent(new MaintenanceUpdated(r.id(), r.code(), r.reporterId(), r.title(),
                    RequestStore.statusLabel(status), null));
        }
    }

    @Override
    public List<StudentItem> ofStudent(long studentId, Long termId) {
        List<RequestStore.Request> rows = jdbc.sql("SELECT * FROM mnt_request WHERE reporter_id = :student"
                + (termId != null ? " AND term_id = :term" : "") + " ORDER BY reported_at DESC, id DESC")
                .params(termId != null ? Map.of("student", studentId, "term", termId) : Map.of("student", studentId))
                .query(RequestStore::request).list();
        Map<Long, String> names = users.displayNames(rows.stream().map(RequestStore.Request::assigneeId)
                .filter(Objects::nonNull).collect(Collectors.toSet()));
        return rows.stream().map(r -> new StudentItem(r.code(), r.title(),
                labels.label("MAINTENANCE_LOCATION", r.location()), labels.label("MAINTENANCE_CATEGORY", r.category()),
                r.reportedAt(), RequestStore.statusLabel(r.status()),
                r.assigneeId() == null ? null : names.get(r.assigneeId()),
                RequestStore.visitWindow(r.visitStart(), r.visitEnd()))).toList();
    }
}
