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
 * Block's timers (urgent or normal hours from now), in the same transaction.
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

    @EventListener
    void on(MaintenanceReported event) {
        RoutingService.Sla sla = routing.sla(event.buildingId());
        int hours = "URGENT".equals(event.urgency()) ? sla.urgent() : sla.normal();
        maintenance.setSlaDue(event.requestId(), Instant.now(clock).plus(Duration.ofHours(hours)));
        routing.route("MAINTENANCE", event.buildingId(), event.category())
                .ifPresent(assignee -> maintenance.assign(event.requestId(), assignee, "routing rule"));
    }
}
