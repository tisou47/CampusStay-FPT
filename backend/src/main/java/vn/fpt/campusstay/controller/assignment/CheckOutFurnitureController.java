package vn.fpt.campusstay.controller.assignment;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import vn.fpt.campusstay.service.assignment.CheckOutFurnitureService;

/**
 * Furniture at check-out: Staff record conditions ({@code /check-outs/{allocationId}/furniture}), attribute shared
 * damage ({@code /check-outs/{allocationId}/damage-claims}); Managers review items a student did not accept; the
 * student reads, agrees and answers claims ({@code /students/me/check-out}).
 */
@RestController
class CheckOutFurnitureController {

    record FurnitureRequest(@Size(max = 100) List<CheckOutFurnitureService.Answer> items, Boolean studentPresent) {
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
        return furniture.record(allocationId, body.items(), Boolean.TRUE.equals(body.studentPresent()));
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

    @PostMapping("/students/me/check-out/agree")
    CheckOutFurnitureService.Charges agree() {
        return furniture.agree();
    }

    @PostMapping("/students/me/damage-claims/{id}")
    CheckOutFurnitureService.Charges answer(@PathVariable String id, @RequestBody AnswerRequest body) {
        return furniture.answerClaim(id, Boolean.TRUE.equals(body.acknowledge()));
    }
}
