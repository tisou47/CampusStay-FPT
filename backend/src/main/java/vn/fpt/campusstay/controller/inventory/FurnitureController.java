package vn.fpt.campusstay.controller.inventory;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.inventory.FurnitureService;

/** Staff and Manager › Furniture: items, the Block stores, moves and transfers (spec §6.19). */
@RestController
@RequestMapping("/furniture")
class FurnitureController {

    /** {@code room} null = the store of {@code block}. */
    record RegisterRequest(Long typeId, String block, String room, Integer quantity, String note) {
    }

    record UpdateRequest(String status, String note, String reason) {
    }

    /** {@code toRoom} (a Room code) or {@code toStore} (a Block code); {@code planned}: a task, not done yet. */
    record MoveRequest(List<Long> items, String toRoom, String toStore, String reason, Boolean planned) {
    }

    private final FurnitureService furniture;

    FurnitureController(FurnitureService furniture) {
        this.furniture = furniture;
    }

    @GetMapping
    FurnitureService.FurniturePage list(@RequestParam(required = false) String block,
            @RequestParam(required = false) String room, @RequestParam(required = false) String location,
            @RequestParam(required = false) Long typeId, @RequestParam(required = false) String status,
            @RequestParam(required = false) String q, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return furniture.list(block, room, location, typeId, status, q, PageQuery.of(page, pageSize));
    }

    @GetMapping("/{id}")
    FurnitureService.FurnitureDetail detail(@PathVariable long id) {
        return furniture.detail(id);
    }

    @PostMapping
    FurnitureService.Registered register(@RequestBody RegisterRequest body) {
        return furniture.register(body.typeId(), body.block(), body.room(), body.quantity(), body.note());
    }

    @PutMapping("/{id}")
    FurnitureService.FurnitureItem update(@PathVariable long id, @RequestBody UpdateRequest body) {
        return furniture.update(id, body.status(), body.note(), body.reason());
    }

    @GetMapping("/moves")
    FurnitureService.MovePage moves(@RequestParam(required = false) String block,
            @RequestParam(required = false) String status, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return furniture.moves(block, status, PageQuery.of(page, pageSize));
    }

    @PostMapping("/moves")
    FurnitureService.Moved move(@RequestBody MoveRequest body) {
        return furniture.move(body.items(), body.toRoom(), body.toStore(), body.reason(), body.planned());
    }

    @PostMapping("/moves/{id}/done")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void done(@PathVariable long id) {
        furniture.finishMove(id);
    }

    @PostMapping("/moves/{id}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable long id) {
        furniture.cancelMove(id);
    }
}
