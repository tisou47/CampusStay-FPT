package vn.fpt.campusstay.controller.inventory;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import vn.fpt.campusstay.service.inventory.DoorCodeService;
import vn.fpt.campusstay.service.inventory.FurnitureService;

/** Student › My Room: the door code of the student's Room and its furniture (web now, Android later). */
@RestController
@RequestMapping("/students/me")
class StudentRoomController {

    record ReportRequest(String itemId, String condition, @Size(max = 300) String note) {
    }

    private final DoorCodeService doorCodes;
    private final FurnitureService furniture;

    StudentRoomController(DoorCodeService doorCodes, FurnitureService furniture) {
        this.doorCodes = doorCodes;
        this.furniture = furniture;
    }

    @GetMapping("/door-code")
    DoorCodeService.MyDoorCode doorCode() {
        return doorCodes.mine();
    }

    @PostMapping("/door-code/reveal")
    DoorCodeService.MyCode reveal() {
        return doorCodes.revealMine();
    }

    @GetMapping("/furniture")
    FurnitureService.MyFurniture furniture() {
        return furniture.mine();
    }

    @PutMapping("/furniture/report")
    FurnitureService.MyFurniture report(@Valid @RequestBody ReportRequest body) {
        return furniture.report(body.itemId(), body.condition(), body.note());
    }
}
