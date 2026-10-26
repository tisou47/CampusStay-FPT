package vn.fpt.campusstay.controller.assignment;

import java.math.BigDecimal;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.assignment.OperationalMoveService;

/** Operational moves during a Term (spec §6.13): Staff inside their Blocks, Managers everywhere; nothing is charged. */
@RestController
class OperationalMoveController {

    record MoveRequest(@Size(max = 20) String allocationId, @Size(max = 30) String bedId,
            @Size(max = 40) String reason,
            @Size(max = 500, message = "Keep the note under 500 characters.") String note,
            @Size(max = 10) String nextTerm, BigDecimal fromElectricity, BigDecimal fromWater,
            BigDecimal toElectricity, BigDecimal toWater) {
    }

    private final OperationalMoveService moves;

    OperationalMoveController(OperationalMoveService moves) {
        this.moves = moves;
    }

    /** {@code q}: a student code, instead of the Allocation. */
    @GetMapping("/operational-moves/options")
    OperationalMoveService.Options options(@RequestParam(required = false) String allocationId,
            @RequestParam(required = false) String q) {
        return moves.options(allocationId, q);
    }

    @PostMapping("/operational-moves")
    OperationalMoveService.Moved move(@Valid @RequestBody MoveRequest body) {
        return moves.move(new OperationalMoveService.MoveCommand(body.allocationId(), body.bedId(), body.reason(),
                body.note(), body.nextTerm(), body.fromElectricity(), body.fromWater(), body.toElectricity(),
                body.toWater()));
    }

    @GetMapping("/operational-moves")
    OperationalMoveService.MovePage list(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return moves.list(termId, block, PageQuery.of(page, pageSize));
    }
}
