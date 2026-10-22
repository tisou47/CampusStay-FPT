package vn.fpt.campusstay.controller.inventory;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.inventory.AdminBuildingService;

/** Admin › Buildings ({@code /admin/**} is Admin only). {@code name} is the Block code ("A"). */
@RestController
@RequestMapping("/admin/buildings")
class AdminBuildingController {

    record BlockRequest(
            @Size(max = 20, message = "Use at most 10 letters or digits.") String name,
            String gender,
            String status) {
    }

    record BulkRequest(Integer fromFloor, Integer toFloor) {
    }

    record Saved(String id) {
    }

    private final AdminBuildingService buildings;

    AdminBuildingController(AdminBuildingService buildings) {
        this.buildings = buildings;
    }

    @GetMapping
    AdminBuildingService.BuildingPage list() {
        return buildings.list();
    }

    @PostMapping
    Saved create(@Valid @RequestBody BlockRequest body) {
        return new Saved(String.valueOf(buildings.create(values(body))));
    }

    @PutMapping("/{id}")
    Saved update(@PathVariable long id, @Valid @RequestBody BlockRequest body) {
        return new Saved(String.valueOf(buildings.update(id, values(body))));
    }

    @PostMapping("/{id}/rooms/bulk")
    AdminBuildingService.BulkResult generateRooms(@PathVariable long id, @RequestBody BulkRequest body) {
        return buildings.generateRooms(id, body.fromFloor(), body.toFloor());
    }

    @GetMapping("/{id}/floors/{floor}/rooms")
    AdminBuildingService.FloorRooms floorRooms(@PathVariable long id, @PathVariable int floor) {
        return buildings.floorRooms(id, floor);
    }

    private static AdminBuildingService.BlockValues values(BlockRequest body) {
        return new AdminBuildingService.BlockValues(body.name(), body.gender(), body.status());
    }
}
