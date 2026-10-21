package vn.fpt.campusstay.mnt.internal;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.auth.UserDirectory;
import vn.fpt.campusstay.mnt.MaintenanceRequests;

/** Implements {@link MaintenanceRequests}. */
@Component
@Transactional(readOnly = true)
class JdbcMaintenanceRequests implements MaintenanceRequests {

    private final JdbcClient jdbc;
    private final MaintenanceService labels;
    private final UserDirectory users;

    JdbcMaintenanceRequests(JdbcClient jdbc, MaintenanceService labels, UserDirectory users) {
        this.jdbc = jdbc;
        this.labels = labels;
        this.users = users;
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
