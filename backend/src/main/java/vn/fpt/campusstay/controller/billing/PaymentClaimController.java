package vn.fpt.campusstay.controller.billing;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.billing.PaymentClaimService;

/**
 * Payment claims (ADR-22, spec §6.7): the student's "I have transferred" and the Managers' queue, where claims are
 * confirmed or rejected one by one or in bulk. A bulk confirmation needs each claim's transfer receipt attached first
 * (R-23). Invoices are addressed by code.
 */
@RestController
class PaymentClaimController {

    record ClaimRequest(@Size(max = 60, message = "Keep the reference under 60 characters.") String reference) {
    }

    record ConfirmRequest(@Size(max = 200, message = "Select at most 200 Invoices at a time.") List<String> invoiceIds) {
    }

    record RejectRequest(@Size(max = 200, message = "Select at most 200 Invoices at a time.") List<String> invoiceIds,
            @Size(max = 500, message = "Keep the reason under 500 characters.") String reason) {
    }

    private final PaymentClaimService claims;

    PaymentClaimController(PaymentClaimService claims) {
        this.claims = claims;
    }

    @PostMapping("/invoices/{id}/claim")
    PaymentClaimService.ClaimView claim(@PathVariable String id, @Valid @RequestBody(required = false) ClaimRequest body) {
        return claims.claim(id, body == null ? null : body.reference());
    }

    @GetMapping("/payment-claims")
    PaymentClaimService.ClaimPage list(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) String type,
            @RequestParam(required = false) String since, @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return claims.list(new PaymentClaimService.Filter(termId, block, type, since, q), PageQuery.of(page, pageSize));
    }

    @PostMapping(path = "/payment-claims/{invoiceId}/receipt", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    PaymentClaimService.Receipt attachReceipt(@PathVariable String invoiceId,
            @RequestPart(name = "receipt", required = false) MultipartFile receipt) {
        try {
            return claims.attachReceipt(invoiceId, receipt == null ? null : receipt.getOriginalFilename(),
                    receipt == null || receipt.isEmpty() ? null : receipt.getBytes());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @PostMapping("/payment-claims/confirm")
    PaymentClaimService.Confirmed confirm(@Valid @RequestBody ConfirmRequest body) {
        return claims.confirm(body.invoiceIds());
    }

    @PostMapping("/payment-claims/reject")
    PaymentClaimService.Rejected reject(@Valid @RequestBody RejectRequest body) {
        return claims.reject(body.invoiceIds(), body.reason());
    }
}
