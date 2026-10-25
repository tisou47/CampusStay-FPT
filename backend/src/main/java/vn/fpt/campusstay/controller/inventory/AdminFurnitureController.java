package vn.fpt.campusstay.controller.inventory;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.inventory.AdminFurnitureService;

/** Admin › Furniture: furniture types and Room Class requirements ({@code /admin/**} is Admin only). */
@RestController
class AdminFurnitureController {

    record TypeRequest(String code, String name, String nameVi, String category, Boolean definesClass, String status) {
    }

    record RequirementsRequest(List<AdminFurnitureService.RequirementValue> items) {
    }

    record Saved(String id) {
    }

    private final AdminFurnitureService furniture;

    AdminFurnitureController(AdminFurnitureService furniture) {
        this.furniture = furniture;
    }

    @GetMapping("/admin/furniture-types")
    AdminFurnitureService.TypePage types() {
        return furniture.types();
    }

    @PostMapping("/admin/furniture-types")
    Saved create(@RequestBody TypeRequest body) {
        return new Saved(String.valueOf(furniture.createType(values(body))));
    }

    @PutMapping("/admin/furniture-types/{id}")
    Saved update(@PathVariable long id, @RequestBody TypeRequest body) {
        return new Saved(String.valueOf(furniture.updateType(id, values(body))));
    }

    @GetMapping("/admin/room-class-requirements")
    AdminFurnitureService.RequirementPage requirements() {
        return furniture.requirements();
    }

    @PutMapping("/admin/room-class-requirements/{roomClassId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void setRequirements(@PathVariable long roomClassId, @RequestBody RequirementsRequest body) {
        furniture.setRequirements(roomClassId, body.items());
    }

    private static AdminFurnitureService.TypeValues values(TypeRequest b) {
        return new AdminFurnitureService.TypeValues(b.code(), b.name(), b.nameVi(), b.category(), b.definesClass(),
                b.status());
    }
}
