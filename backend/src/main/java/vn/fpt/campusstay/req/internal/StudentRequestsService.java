package vn.fpt.campusstay.req.internal;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.asg.Residences;
import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.auth.Role;
import vn.fpt.campusstay.mnt.MaintenanceRequests;
import vn.fpt.campusstay.shared.error.FieldErrors;
import vn.fpt.campusstay.shared.web.PageQuery;

/**
 * The student's requests screen: Maintenance Requests (MNT) and, in the
 * room-changes tab, Room-Change Requests and swaps, newest first.
 */
@Service
public class StudentRequestsService {

    public record Counts(long maintenance, long roomChanges) {
    }

    public record Page(List<?> items, long total, Counts counts, String room) {
    }

    private final CurrentUser currentUser;
    private final MaintenanceRequests maintenance;
    private final RoomChangeService roomChanges;
    private final SwapService swaps;
    private final Residences residences;

    public StudentRequestsService(CurrentUser currentUser, MaintenanceRequests maintenance,
            RoomChangeService roomChanges, SwapService swaps, Residences residences) {
        this.currentUser = currentUser;
        this.maintenance = maintenance;
        this.roomChanges = roomChanges;
        this.swaps = swaps;
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
        List<MaintenanceRequests.StudentItem> repairs = maintenance.ofStudent(me, termId);
        List<RoomChangeService.StudentItem> changes = new ArrayList<>(roomChanges.ofStudent(me, termId));
        changes.addAll(swaps.ofStudent(me, termId));
        changes.sort(Comparator.comparing(RoomChangeService.StudentItem::submittedAt).reversed());
        List<?> all = k.equals("maintenance") ? repairs : changes;
        String room = residences.current(me).map(Residences.Residence::room).orElse(null);
        return new Page(all.stream().skip(page.offset()).limit(page.limit()).toList(), all.size(),
                new Counts(repairs.size(), changes.size()), room);
    }
}
