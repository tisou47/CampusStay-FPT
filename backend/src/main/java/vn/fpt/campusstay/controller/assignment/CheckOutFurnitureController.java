package vn.fpt.campusstay.controller.assignment;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import vn.fpt.campusstay.service.assignment.CheckOutFurnitureService;

/**
 * Furniture at check-out: Staff record conditions ({@code /check-outs/{allocationId}/furniture}), attribute shared
 * damage ({@code /check-outs/{allocationId}/damage-claims}); Managers review items a student did not accept; the
 * student reads, agrees and answers claims ({@code /students/me/check-out}).
 */
@RestController
class CheckOutFurnitureController {

    record FurnitureRequest(@Size(max = 100) List<CheckOutFurnitureService.Answer> items, Boolean studentPresent,
            @DecimalMin(value = "0", message = "Enter a reading of 0 or more.")
            @DecimalMax(value = "999999999", message = "Enter a valid reading.") BigDecimal electricity,
            @DecimalMin(value = "0", message = "Enter a reading of 0 or more.")
            @DecimalMax(value = "999999999", message = "Enter a valid reading.") BigDecimal water) {
    }

    record DisputeRequest(@Size(max = 100) List<String> itemIds,
            @Size(max = 500, message = "Keep the reason under 500 characters.") String reason) {
    }

    record DisputeAnswer(@Size(max = 500, message = "Keep the answer under 500 characters.") String answer) {
    }

    record ClaimRequest(String itemId, String condition,
            @Size(max = 300, message = "Keep the note under 300 characters.") String note) {
    }

    record DecisionRequest(Boolean keep, @Size(max = 300, message = "Keep the reason under 300 characters.") String note) {
    }

    record AnswerRequest(Boolean acknowledge) {
    }

    private final CheckOutFurnitureService furniture;

    CheckOutFurnitureController(CheckOutFurnitureService furniture) {
        this.furniture = furniture;
    }

    @GetMapping("/check-outs/{allocationId}/furniture")
    CheckOutFurnitureService.Charges view(@PathVariable String allocationId) {
        return furniture.view(allocationId);
    }

    @PutMapping("/check-outs/{allocationId}/furniture")
    CheckOutFurnitureService.Charges record(@PathVariable String allocationId, @Valid @RequestBody FurnitureRequest body) {
        return furniture.record(allocationId, body.items(), Boolean.TRUE.equals(body.studentPresent()),
                body.electricity(), body.water());
    }

    @PostMapping("/check-outs/{allocationId}/damage-claims")
    CheckOutFurnitureService.Claim claim(@PathVariable String allocationId, @Valid @RequestBody ClaimRequest body) {
        return furniture.claim(allocationId, body.itemId(), body.condition(), body.note());
    }

    @GetMapping("/check-out-reviews")
    List<CheckOutFurnitureService.ReviewRow> reviews(@RequestParam(required = false) String block) {
        return furniture.reviews(block);
    }

    @PostMapping("/check-out-reviews/{allocationId}/{itemId}")
    CheckOutFurnitureService.Charges decide(@PathVariable String allocationId, @PathVariable String itemId,
            @Valid @RequestBody DecisionRequest body) {
        return furniture.decide(allocationId, itemId, Boolean.TRUE.equals(body.keep()), body.note());
    }

    @GetMapping("/students/me/check-out")
    CheckOutFurnitureService.Charges mine() {
        return furniture.mine();
    }

    record MetersRequest(@DecimalMax("99999999") BigDecimal electricity, @DecimalMax("99999999") BigDecimal water) {
    }

    @PutMapping("/students/me/check-out/meters")
    CheckOutFurnitureService.Charges saveMeters(@Valid @RequestBody MetersRequest body) {
        return furniture.saveMyMeters(body.electricity(), body.water());
    }

    @PostMapping(path = "/students/me/check-out/meters/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    CheckOutFurnitureService.MeterPhoto addMeterPhoto(@RequestPart(name = "photo", required = false) MultipartFile photo) {
        byte[] bytes;
        try {
            bytes = photo == null ? null : photo.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return furniture.addMyMeterPhoto(photo == null ? null : photo.getOriginalFilename(), bytes);
    }

    @DeleteMapping("/students/me/check-out/meters/photos/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removeMeterPhoto(@PathVariable String id) {
        furniture.removeMyMeterPhoto(id);
    }

    @PostMapping("/students/me/check-out/submit")
    CheckOutFurnitureService.Charges submitDeclaration() {
        return furniture.submitMyDeclaration();
    }

    @PostMapping("/students/me/check-out/dispute")
    CheckOutFurnitureService.Charges dispute(@Valid @RequestBody DisputeRequest body) {
        return furniture.disputeMine(body.itemIds(), body.reason());
    }

    @PostMapping("/check-outs/{allocationId}/dispute/answer")
    CheckOutFurnitureService.Charges answerDispute(@PathVariable String allocationId,
            @Valid @RequestBody DisputeAnswer body) {
        return furniture.answerDispute(allocationId, body.answer());
    }

    @PostMapping("/students/me/check-out/agree")
    CheckOutFurnitureService.Charges agree() {
        return furniture.agree();
    }

    @PostMapping("/students/me/damage-claims/{id}")
    CheckOutFurnitureService.Charges answer(@PathVariable String id, @RequestBody AnswerRequest body) {
        return furniture.answerClaim(id, Boolean.TRUE.equals(body.acknowledge()));
    }
}
