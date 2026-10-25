package vn.fpt.campusstay.controller.inventory;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.inventory.DoorCodeService;
import vn.fpt.campusstay.service.inventory.FurnitureService;

/** Student › My Room: the door code of the student's Room and its furniture (web now, Android later). */
@RestController
@RequestMapping("/students/me")
class StudentRoomController {

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
}
