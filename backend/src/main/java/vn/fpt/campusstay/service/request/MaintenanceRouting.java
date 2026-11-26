package vn.fpt.campusstay.service.request;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.event.MaintenanceReported;
import vn.fpt.campusstay.service.maintenance.MaintenanceRequests;

/**
 * A new Maintenance Request goes to the Block's routing rule for its category and gets its SLA deadline from the
 * Block's timers (urgent or normal hours from now), in the same transaction. A request created with someone in
 * charge (an inspection's request, assigned to the inspector) keeps them.
 */
@Component
class MaintenanceRouting {

    private final RoutingService routing;
    private final MaintenanceRequests maintenance;
    private final Clock clock;

    MaintenanceRouting(RoutingService routing, MaintenanceRequests maintenance, Clock clock) {
        this.routing = routing;
        this.maintenance = maintenance;
        this.clock = clock;
    }

    // Same transaction: a request is never stored without its route and SLA.
    @EventListener
    void on(MaintenanceReported event) {
        RoutingService.Sla sla = routing.sla(event.buildingId());
        int hours = "URGENT".equals(event.urgency()) ? sla.urgent() : sla.normal();
        maintenance.setSlaDue(event.requestId(), Instant.now(clock).plus(Duration.ofHours(hours)));
        if (maintenance.isAssigned(event.requestId())) {
            return; // created with someone in charge (the inspector of the Room)
        }
        routing.route("MAINTENANCE", event.buildingId(), event.category())
                .ifPresent(assignee -> maintenance.assign(event.requestId(), assignee, "routing rule"));
    }
}
