package vn.fpt.campusstay.asg.web;

import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.asg.internal.DeskService;
import vn.fpt.campusstay.shared.web.PageQuery;

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
            Boolean draft) {
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
                body.conditionGood(), body.keyReturned(), body.damageCharge(), Boolean.TRUE.equals(body.draft())));
    }
}
