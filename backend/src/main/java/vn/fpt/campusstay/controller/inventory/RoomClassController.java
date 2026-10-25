package vn.fpt.campusstay.controller.inventory;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.inventory.RoomClassService;

/** Manager › Room Classes: the Room Class of every Room per Term (ADR-24; reading also for Staff and the Admin). */
@RestController
@RequestMapping("/inventory/room-classes")
class RoomClassController {

    /** {@code rooms}: Room codes; their class becomes {@code roomClassId} from the Term on. */
    record SetRequest(Long termId, List<String> rooms, Long roomClassId) {
    }

    private final RoomClassService roomClasses;

    RoomClassController(RoomClassService roomClasses) {
        this.roomClasses = roomClasses;
    }

    @GetMapping
    RoomClassService.RoomClassPage list(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) Integer floor,
            @RequestParam(required = false) Long roomClassId, @RequestParam(required = false) String match,
            @RequestParam(required = false) String q, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return roomClasses.list(termId, block, floor, roomClassId, match, q, PageQuery.of(page, pageSize));
    }

    @PutMapping
    RoomClassService.Changed set(@RequestBody SetRequest body) {
        return roomClasses.set(body.termId(), body.rooms(), body.roomClassId());
    }
}
