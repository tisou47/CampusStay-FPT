package vn.fpt.campusstay.service.notification;

import java.text.NumberFormat;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.config.TimeConfig;
import vn.fpt.campusstay.event.CheckInAvailable;
import vn.fpt.campusstay.event.CheckInInventoryDue;
import vn.fpt.campusstay.event.CheckInInventoryFinal;
import vn.fpt.campusstay.event.CheckInInventorySubmitted;
import vn.fpt.campusstay.event.CheckInToAgree;
import vn.fpt.campusstay.event.CheckInVisit;
import vn.fpt.campusstay.event.CheckOutToAgree;
import vn.fpt.campusstay.event.DamageToAcknowledge;

/**
 * The check-in inventory and furniture charges: the student hears when they may move in, before the inventory is
 * due, about a visit, a record to agree with and the final record; the Block's Staff hear about inventories that
 * differ from the Room's record.
 */
@Component
class HandoverNotificationListener {

    private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy")
            .withZone(TimeConfig.CAMPUS_ZONE);

    private final InAppNotifier notifier;

    HandoverNotificationListener(InAppNotifier notifier) {
        this.notifier = notifier;
    }

    @EventListener
    void on(CheckInAvailable e) {
        notifier.notify(e.studentId(), "CHECK_IN_AVAILABLE", Map.of("room", e.room(), "hours", String.valueOf(e.hours())),
                "/student/room/inventory");
    }

    @EventListener
    void on(CheckInInventoryDue e) {
        notifier.notify(e.studentId(), "CHECK_IN_INVENTORY_DUE", Map.of("room", e.room(), "dueAt", when(e.dueAt())),
                "/student/room/inventory");
    }

    @EventListener
    void on(CheckInInventorySubmitted e) {
        for (long staff : e.staffIds()) {
            notifier.notify(staff, "CHECK_IN_INVENTORY_SUBMITTED",
                    Map.of("name", e.name(), "room", e.room(), "comparison", e.comparison()),
                    "/staff/check-in/inventories");
        }
    }

    @EventListener
    void on(CheckInVisit e) {
        notifier.notify(e.studentId(), "CHECK_IN_VISIT",
                Map.of("room", e.room(), "visitAt", e.visitAt() == null ? "soon" : when(e.visitAt())), "/student/room/inventory");
    }

    @EventListener
    void on(CheckInToAgree e) {
        notifier.notify(e.studentId(), "CHECK_IN_TO_AGREE", Map.of("room", e.room()), "/student/room/inventory");
    }

    @EventListener
    void on(CheckInInventoryFinal e) {
        notifier.notify(e.studentId(), "CHECK_IN_INVENTORY_FINAL",
                Map.of("room", e.room(), "from", when(e.utilityFrom())), "/student/room/inventory");
    }

    @EventListener
    void on(DamageToAcknowledge e) {
        notifier.notify(e.studentId(), "DAMAGE_TO_ACKNOWLEDGE", Map.of("item", e.item(), "room", e.room(),
                "condition", e.condition(), "dueAt", when(e.dueAt()), "amount", money(e.amount())), "/student/room/inventory");
    }

    @EventListener
    void on(CheckOutToAgree e) {
        notifier.notify(e.studentId(), "CHECK_OUT_TO_AGREE", Map.of("room", e.room(), "amount", money(e.amount())),
                "/student/room/inventory");
    }

    private static String when(Instant at) {
        return at == null ? "" : WHEN.format(at);
    }

    private static String money(long amount) {
        return NumberFormat.getNumberInstance(Locale.US).format(amount) + " ₫";
    }
}
