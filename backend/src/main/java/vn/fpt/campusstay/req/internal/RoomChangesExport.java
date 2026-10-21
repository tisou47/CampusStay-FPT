package vn.fpt.campusstay.req.internal;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.auth.CurrentUser;
import vn.fpt.campusstay.auth.Permission;
import vn.fpt.campusstay.shared.export.ReportExport;

/** {@code GET /exports/room-changes}: the Room-Change queue with its filters. */
@Component
class RoomChangesExport implements ReportExport {

    private final RoomChangeService roomChanges;
    private final CurrentUser currentUser;

    RoomChangesExport(RoomChangeService roomChanges, CurrentUser currentUser) {
        this.roomChanges = roomChanges;
        this.currentUser = currentUser;
    }

    @Override
    public String report() {
        return "room-changes";
    }

    @Override
    @Transactional(readOnly = true)
    public Table export(Map<String, String> f) {
        currentUser.require(Permission.DECIDE_ROOM_CHANGES);
        RoomChangeService.QueuePage page = roomChanges.queue(ReportExport.longFilter(f, "termId"), f.get("block"),
                f.get("status"), f.get("kind"), ALL);
        return new Table("room-change-requests", List.of("Request", "Student", "Student code", "Kind", "From Room",
                "From Bed", "Room Type", "Room Class", "Reason", "Difference (VND)", "Submitted at", "Status"),
                page.items().stream().map(i -> Arrays.<Object>asList(i.id(), i.studentName(), i.studentCode(), i.kind(),
                        i.from() == null ? "" : i.from().room(), i.from() == null ? "" : i.from().bed(),
                        i.to() == null ? "" : i.to().roomTypeName(), i.to() == null ? "" : i.to().roomClassName(),
                        i.reason(), i.difference(), i.submittedAt(), i.status())).toList());
    }
}
