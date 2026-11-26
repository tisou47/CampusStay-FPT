package vn.fpt.campusstay.controller.inventory;

import java.io.IOException;
import java.io.UncheckedIOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

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

    @PostMapping(path = "/furniture/report/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    FurnitureService.ReportPhoto addReportPhoto(@RequestParam(required = false) String itemId,
            @RequestPart(name = "photo", required = false) MultipartFile photo) {
        byte[] bytes;
        try {
            bytes = photo == null ? null : photo.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return furniture.addReportPhoto(itemId, photo == null ? null : photo.getOriginalFilename(), bytes);
    }

    @DeleteMapping("/furniture/report/photos/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removeReportPhoto(@PathVariable String id) {
        furniture.removeReportPhoto(id);
    }
}
