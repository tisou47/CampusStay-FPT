package vn.fpt.campusstay.controller.setting;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.setting.SystemHealthService;

/** Admin › System health (D2). */
@RestController
class SystemHealthController {

    private final SystemHealthService health;

    SystemHealthController(SystemHealthService health) {
        this.health = health;
    }

    @GetMapping("/admin/system/health")
    SystemHealthService.Health health() {
        return health.health();
    }
}
