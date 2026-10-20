package vn.fpt.campusstay.inv.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.inv.internal.InventoryService;

/** Staff and Manager › Inventory (Block-scoped). */
@RestController
@RequestMapping("/inventory")
class InventoryController {

    record OutOfServiceRequest(
            @NotBlank(message = "Choose a reason.") @Size(max = 150) String reason,
            @Size(max = 500, message = "Keep the note under 500 characters.") String note) {
    }

    private final InventoryService inventory;

    InventoryController(InventoryService inventory) {
        this.inventory = inventory;
    }

    @GetMapping("/structure")
    InventoryService.Structure structure(@RequestParam(required = false) String block) {
        return inventory.structure(block);
    }

    @GetMapping("/rooms")
    InventoryService.FloorView rooms(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam int floor) {
        return inventory.floor(termId, block, floor);
    }

    @GetMapping("/rooms/{code}")
    InventoryService.RoomRef room(@PathVariable String code) {
        return inventory.room(code);
    }

    @PostMapping("/rooms/{code}/out-of-service")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void outOfService(@PathVariable String code, @Valid @RequestBody OutOfServiceRequest body) {
        inventory.setOutOfService(code, body.reason(), body.note());
    }

    @PostMapping("/rooms/{code}/back-in-service")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void backInService(@PathVariable String code) {
        inventory.backInService(code);
    }
}
