package vn.fpt.campusstay.controller.assignment;

import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.assignment.NextTermFeeService;
import vn.fpt.campusstay.service.assignment.RenewalService;
import vn.fpt.campusstay.service.assignment.TurnoverService;

/**
 * The Term transition for Staff and Managers (spec §5.1, §6.10): the requests windows and their overview, the
 * next-Term fees (Managers) and the turnover between two Terms.
 */
@RestController
class RenewalController {

    record MeterCutRequest(@Size(max = 20) String room, BigDecimal electricity, BigDecimal water) {
    }

    record IssueRequest(@NotNull(message = "Choose a Term.") Long termId) {
    }

    private final RenewalService renewals;
    private final NextTermFeeService fees;
    private final TurnoverService turnover;

    RenewalController(RenewalService renewals, NextTermFeeService fees, TurnoverService turnover) {
        this.renewals = renewals;
        this.fees = fees;
        this.turnover = turnover;
    }

    @GetMapping("/renewals")
    List<RenewalService.WindowItem> windows() {
        return renewals.windows();
    }

    @GetMapping("/renewals/overview")
    RenewalService.Overview overview(@RequestParam(required = false) Long termId) {
        return renewals.overview(termId);
    }

    @GetMapping("/next-term-fees")
    NextTermFeeService.Preview preview(@RequestParam long termId) {
        return fees.preview(termId);
    }

    @PostMapping("/next-term-fees/issue")
    NextTermFeeService.IssueResult issue(@Valid @RequestBody IssueRequest body) {
        return fees.issue(body.termId());
    }

    @GetMapping("/turnover")
    TurnoverService.Turnover turnover(@RequestParam long termId, @RequestParam(required = false) String block) {
        return turnover.overview(termId, block);
    }

    @PostMapping("/turnover/meter-cuts")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void meterCut(@Valid @RequestBody MeterCutRequest body) {
        turnover.meterCut(body.room(), body.electricity(), body.water());
    }
}
