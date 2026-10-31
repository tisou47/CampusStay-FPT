package vn.fpt.campusstay.controller.setting;

import java.math.BigDecimal;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.setting.AdminCatalogService;

/** Admin › Room Types and Admin › Room Classes. */
@RestController
@RequestMapping("/admin")
class AdminCatalogController {

    record RoomTypeRequest(
            @Size(max = 50, message = "Use at most 50 characters.") String name,
            Integer beds,
            Long basePrice,
            String roommateSelection,
            String status) {
    }

    record RoomClassRequest(
            @Size(max = 50, message = "Use at most 50 characters.") String name,
            BigDecimal surchargeRate,
            String status) {
    }

    record Saved(String id) {
    }

    private final AdminCatalogService catalog;

    AdminCatalogController(AdminCatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/room-types")
    AdminCatalogService.RoomTypePage roomTypes() {
        return catalog.roomTypes();
    }

    @PostMapping("/room-types")
    Saved createRoomType(@Valid @RequestBody RoomTypeRequest body) {
        return new Saved(String.valueOf(catalog.createRoomType(values(body))));
    }

    @PutMapping("/room-types/{id}")
    Saved updateRoomType(@PathVariable long id, @Valid @RequestBody RoomTypeRequest body) {
        return new Saved(String.valueOf(catalog.updateRoomType(id, values(body))));
    }

    @GetMapping("/room-classes")
    AdminCatalogService.RoomClassPage roomClasses() {
        return catalog.roomClasses();
    }

    @PostMapping("/room-classes")
    Saved createRoomClass(@Valid @RequestBody RoomClassRequest body) {
        return new Saved(String.valueOf(catalog.createRoomClass(values(body))));
    }

    @PutMapping("/room-classes/{id}")
    Saved updateRoomClass(@PathVariable long id, @Valid @RequestBody RoomClassRequest body) {
        return new Saved(String.valueOf(catalog.updateRoomClass(id, values(body))));
    }

    private static AdminCatalogService.RoomTypeValues values(RoomTypeRequest b) {
        return new AdminCatalogService.RoomTypeValues(b.name(), b.beds(), b.basePrice(), b.roommateSelection(),
                b.status());
    }

    private static AdminCatalogService.RoomClassValues values(RoomClassRequest b) {
        return new AdminCatalogService.RoomClassValues(b.name(), b.surchargeRate(), b.status());
    }
}
