package vn.fpt.campusstay.bil.web;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.bil.internal.FinanceService;
import vn.fpt.campusstay.shared.web.PageQuery;

/** Block Finance: figures, Invoices, overdue Invoices and reminders, refunds. */
@RestController
class FinanceController {

    record RemindRequest(@Size(max = 200, message = "Send at most 200 reminders at a time.") List<String> invoiceIds) {
    }

    record RefundDecisionRequest(@Size(max = 20) String decision,
            @Size(max = 500, message = "Keep the note under 500 characters.") String note) {
    }

    private final FinanceService finance;

    FinanceController(FinanceService finance) {
        this.finance = finance;
    }

    @GetMapping("/finance/summary")
    FinanceService.Summary summary(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block) {
        return finance.summary(termId, block);
    }

    @GetMapping("/finance/overdue")
    FinanceService.OverduePage overdue(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return finance.overdue(termId, block, PageQuery.of(page, pageSize));
    }

    @PostMapping("/finance/reminders")
    FinanceService.Sent remind(@Valid @RequestBody RemindRequest body) {
        return finance.remind(body.invoiceIds());
    }

    @GetMapping("/invoices")
    FinanceService.InvoicePage invoices(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize) {
        return finance.invoices(termId, block, PageQuery.of(page, pageSize));
    }

    @GetMapping("/refunds")
    FinanceService.RefundPage refunds(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return finance.refunds(termId, block, status, PageQuery.of(page, pageSize));
    }

    @PostMapping("/refunds/{id}/decision")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void decideRefund(@PathVariable String id, @Valid @RequestBody RefundDecisionRequest body) {
        finance.decideRefund(id, body.decision(), body.note());
    }
}
