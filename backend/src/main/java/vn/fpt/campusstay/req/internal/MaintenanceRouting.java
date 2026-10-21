package vn.fpt.campusstay.req.internal;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.mnt.MaintenanceReported;
import vn.fpt.campusstay.mnt.MaintenanceRequests;

/** A new Maintenance Request goes to the Block's routing rule for its category, in the same transaction. */
@Component
class MaintenanceRouting {

    private final RoutingService routing;
    private final MaintenanceRequests maintenance;

    MaintenanceRouting(RoutingService routing, MaintenanceRequests maintenance) {
        this.routing = routing;
        this.maintenance = maintenance;
    }

    @EventListener
    void on(MaintenanceReported event) {
        routing.route("MAINTENANCE", event.buildingId(), event.category())
                .ifPresent(assignee -> maintenance.assign(event.requestId(), assignee, "routing rule"));
    }
}
