package vn.fpt.campusstay.controller.assignment;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import vn.fpt.campusstay.service.assignment.DeskService;
import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.exception.FieldErrors;

/** The Check-in and Check-out desk (Staff and Managers of the Block). */
@RestController
class DeskController {

    record CheckInRequest(Long termId,
            @NotBlank(message = "Look up the student first.") @Size(max = 20) String studentCode,
            @Size(max = 20) List<@Size(max = 100) String> items,
            @Size(max = 500, message = "Keep the note under 500 characters.") String note) {
    }

    record CheckOutRequest(
            @DecimalMin(value = "0", message = "Enter a reading of 0 or more.")
            @DecimalMax(value = "999999999", message = "Enter a valid reading.") BigDecimal electricity,
            @DecimalMin(value = "0", message = "Enter a reading of 0 or more.")
            @DecimalMax(value = "999999999", message = "Enter a valid reading.") BigDecimal water,
            Boolean conditionGood, Boolean keyReturned,
            @Min(value = 0, message = "The damage charge cannot be negative.")
            @Max(value = 1_000_000_000, message = "Enter a valid amount.") Long damageCharge,
            Boolean draft, @Size(max = 100) List<DeskService.Damage> damages) {
    }

    /** A Room's final meter reading typed on the desk page (its leavers' check-out drafts take it). */
    record RoomReadingInput(@NotBlank @Size(max = 20) String room,
            @DecimalMin(value = "0", message = "Enter a reading of 0 or more.")
            @DecimalMax(value = "999999999", message = "Enter a valid reading.") BigDecimal electricity,
            @DecimalMin(value = "0", message = "Enter a reading of 0 or more.")
            @DecimalMax(value = "999999999", message = "Enter a valid reading.") BigDecimal water) {
    }

    record RoomReadingsRequest(@Size(max = 2000) List<@Valid RoomReadingInput> readings) {
    }

    private final DeskService desk;

    DeskController(DeskService desk) {
        this.desk = desk;
    }

    @GetMapping("/check-in/today")
    DeskService.Today today(@RequestParam(required = false) Long termId, @RequestParam(required = false) String block) {
        return desk.today(termId, block);
    }

    @GetMapping("/check-in/lookup")
    DeskService.Lookup lookup(@RequestParam(required = false) Long termId, @RequestParam(required = false) String q) {
        return desk.lookup(termId, q);
    }

    @PostMapping("/check-in")
    DeskService.CheckedIn checkIn(@Valid @RequestBody CheckInRequest body) {
        return desk.checkIn(body.termId(), body.studentCode(), body.items(), body.note());
    }

    @GetMapping("/check-out")
    DeskService.CheckOutPage checkOutList(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) String q,
            @RequestParam(required = false) String reason, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return desk.checkOutList(termId, block, q, reason, PageQuery.of(page, pageSize));
    }

    @GetMapping("/check-out/{allocationId}")
    DeskService.CheckOutDetail checkOutDetail(@PathVariable String allocationId) {
        return desk.checkOutDetail(allocationId);
    }

    @PostMapping("/check-out/{allocationId}")
    DeskService.CheckedOut checkOut(@PathVariable String allocationId, @Valid @RequestBody CheckOutRequest body) {
        return desk.checkOut(allocationId, new DeskService.CheckOutCommand(body.electricity(), body.water(),
                body.conditionGood(), body.keyReturned(), body.damageCharge(), Boolean.TRUE.equals(body.draft()),
                body.damages()));
    }

    @GetMapping("/check-out/readings")
    DeskService.RoomReadings roomReadings(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return desk.roomReadings(termId, block);
    }

    @PutMapping("/check-out/readings")
    DeskService.ReadingsSaved saveRoomReadings(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @Valid @RequestBody RoomReadingsRequest body) {
        List<DeskService.ReadingLine> lines = body.readings() == null ? List.of() : body.readings().stream()
                .map(r -> new DeskService.ReadingLine(0, r.room(), r.electricity(), r.water())).toList();
        return desk.saveRoomReadings(termId, block, lines);
    }

    @GetMapping("/check-out/readings/template")
    ResponseEntity<byte[]> roomReadingsTemplate(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("check-out-readings.xlsx").build().toString())
                .body(desk.roomReadingsTemplate(termId, block));
    }

    @PostMapping(value = "/check-out/readings", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    DeskService.ReadingsSaved uploadRoomReadings(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block,
            @RequestPart(name = "file", required = false) MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw FieldErrors.single("file", "Choose a CSV or XLSX file.");
        }
        return desk.saveRoomReadingsFile(termId, block, file.getOriginalFilename(), file.getBytes());
    }
}
