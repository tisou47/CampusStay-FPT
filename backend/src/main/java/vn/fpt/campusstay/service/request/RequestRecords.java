package vn.fpt.campusstay.service.request;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.service.auth.StudentRecords;
import vn.fpt.campusstay.service.maintenance.MaintenanceRequests;

/**
 * The student hub's requests: Maintenance Requests, Room-Change Requests and swaps, as on the student's own
 * requests screen (implements Auth's {@link StudentRecords}).
 */
@Component
@Transactional(readOnly = true)
class RequestRecords implements StudentRecords {

    private final MaintenanceRequests maintenance;
    private final RoomChangeService roomChanges;
    private final SwapService swaps;

    RequestRecords(MaintenanceRequests maintenance, RoomChangeService roomChanges, SwapService swaps) {
        this.maintenance = maintenance;
        this.roomChanges = roomChanges;
        this.swaps = swaps;
    }

    @Override
    public String section() {
        return "requests";
    }

    @Override
    public List<Item> of(long studentId, int limit) {
        List<Item> items = new ArrayList<>();
        for (MaintenanceRequests.StudentItem m : maintenance.ofStudent(studentId, null)) {
            items.add(new Item("maintenance", m.id(), m.title(), "Maintenance", m.status(), null, m.reportedAt()));
        }
        List<RoomChangeService.StudentItem> changes = new ArrayList<>(roomChanges.ofStudent(studentId, null));
        changes.addAll(swaps.ofStudent(studentId, null));
        for (RoomChangeService.StudentItem c : changes) {
            items.add(new Item(c.id().startsWith("SW-") ? "swap" : "room-change", c.id(), c.summary(), c.typeLabel(),
                    c.status(), null, c.submittedAt()));
        }
        items.sort(Comparator.comparing(Item::at, Comparator.nullsLast(Comparator.reverseOrder())));
        return items.stream().limit(limit).toList();
    }
}
