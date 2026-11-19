package vn.fpt.campusstay.service.request;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.service.maintenance.MaintenanceRequests;
import vn.fpt.campusstay.service.setting.TermCatalog;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.dto.PageQuery;

/**
 * The student's requests screen: Maintenance Requests (Maintenance) and, in the room-changes tab, the next-Term
 * requests: room changes, swaps, extensions and the end of the stay, newest first. The requests filed while living in a Term belong to the next Term (the one
 * whose requests window follows it), so a Term's tab also lists those.
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
    private final StayRequestService stayRequests;
    private final Residences residences;
    private final TermCatalog terms;

    public StudentRequestsService(CurrentUser currentUser, MaintenanceRequests maintenance,
            RoomChangeService roomChanges, SwapService swaps,
            StayRequestService stayRequests, Residences residences, TermCatalog terms) {
        this.currentUser = currentUser;
        this.maintenance = maintenance;
        this.roomChanges = roomChanges;
        this.swaps = swaps;
        this.stayRequests = stayRequests;
        this.residences = residences;
        this.terms = terms;
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
        List<Long> requestTerms = new ArrayList<>();
        requestTerms.add(termId);
        if (termId != null) {
            terms.renewals().stream().filter(r -> r.previousTermId() == termId).forEach(r -> requestTerms.add(r.termId()));
        }
        List<RoomChangeService.StudentItem> changes = new ArrayList<>();
        for (Long t : requestTerms) {
            changes.addAll(roomChanges.ofStudent(me, t));
            changes.addAll(swaps.ofStudent(me, t));
            changes.addAll(stayRequests.ofStudent(me, t));
        }
        changes.sort(Comparator.comparing(RoomChangeService.StudentItem::submittedAt).reversed());
        List<?> all = k.equals("maintenance") ? repairs : changes;
        String room = residences.current(me).map(Residences.Residence::room).orElse(null);
        return new Page(all.stream().skip(page.offset()).limit(page.limit()).toList(), all.size(),
                new Counts(repairs.size(), changes.size()), room);
    }
}
