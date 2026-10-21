package vn.fpt.campusstay.req.internal;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.asg.Residences;
import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.auth.Role;
import vn.fpt.campusstay.mnt.MaintenanceRequests;
import vn.fpt.campusstay.shared.error.FieldErrors;
import vn.fpt.campusstay.shared.web.PageQuery;

/**
 * The student's requests screen: Maintenance Requests (MNT) and Room-Change
 * Requests. Room changes are built in S5; until then that tab lists nothing.
 */
@Service
public class StudentRequestsService {

    public record Counts(long maintenance, long roomChanges) {
    }

    public record Page(List<?> items, long total, Counts counts, String room) {
    }

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;
    private final MaintenanceRequests maintenance;
    private final Residences residences;

    public StudentRequestsService(JdbcClient jdbc, CurrentUser currentUser, MaintenanceRequests maintenance,
            Residences residences) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.maintenance = maintenance;
        this.residences = residences;
    }

    /** @param kind {@code maintenance} (default) or {@code room-changes}; {@code termId} null = every Term */
    @Transactional(readOnly = true)
    public Page mine(String kind, Long termId, PageQuery page) {
        long me = currentUser.require(Role.STUDENT).userId();
        String k = kind == null || kind.isBlank() ? "maintenance" : kind.trim();
        if (!k.equals("maintenance") && !k.equals("room-changes")) {
            throw FieldErrors.single("kind", "Choose maintenance or room-changes.");
        }
        List<MaintenanceRequests.StudentItem> mine = maintenance.ofStudent(me, termId);
        long roomChanges = jdbc.sql("SELECT count(*) FROM req_room_change WHERE student_id = :me"
                + (termId != null ? " AND term_id = :term" : ""))
                .params(termId != null ? Map.of("me", me, "term", termId) : Map.of("me", me))
                .query(Long.class).single();
        List<?> items = k.equals("maintenance") ? mine.stream().skip(page.offset()).limit(page.limit()).toList()
                : List.of();
        long total = k.equals("maintenance") ? mine.size() : 0;
        String room = residences.current(me).map(Residences.Residence::room).orElse(null);
        return new Page(items, total, new Counts(mine.size(), roomChanges), room);
    }
}
