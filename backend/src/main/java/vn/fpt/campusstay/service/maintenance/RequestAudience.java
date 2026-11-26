package vn.fpt.campusstay.service.maintenance;

import java.util.LinkedHashSet;
import java.util.Set;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.event.MaintenanceUpdated;
import vn.fpt.campusstay.repository.maintenance.RequestStore;
import vn.fpt.campusstay.service.assignment.Residences;
import vn.fpt.campusstay.service.inventory.Inventory;

/**
 * Which students hear about a Maintenance Request: the student who reported it, or, for a request the back office
 * opened in a Room (an inspection, a check-in or check-out finding), the students living in that Room now. They see
 * it in their requests and are told when Staff plan a visit or change its status, since Staff may come into their Room.
 */
@Component
class RequestAudience {

    private final Residences residences;
    private final Inventory inventory;
    private final ApplicationEventPublisher events;

    RequestAudience(Residences residences, Inventory inventory, ApplicationEventPublisher events) {
        this.residences = residences;
        this.inventory = inventory;
        this.events = events;
    }

    /** The students living in the Room now (door code released or checked in at the desk). */
    Set<Long> residentsOf(long roomId) {
        return new LinkedHashSet<>(residences.residentsOfBeds(inventory.bedsOfRoom(roomId).stream()
                .map(Inventory.BedSlot::bedId).toList()).values());
    }

    Set<Long> of(RequestStore.Request r) {
        return r.source().equals("STUDENT") ? Set.of(r.reporterId()) : residentsOf(r.roomId());
    }

    /** Tells each student of the request about a change ({@code message}: the public text, or null). */
    void notify(RequestStore.Request r, String status, String message) {
        notify(r.id(), r.code(), r.title(), of(r), status, message);
    }

    void notify(long requestId, String code, String title, Set<Long> students, String status, String message) {
        for (long student : students) {
            events.publishEvent(new MaintenanceUpdated(requestId, code, student, title, status, message));
        }
    }
}
