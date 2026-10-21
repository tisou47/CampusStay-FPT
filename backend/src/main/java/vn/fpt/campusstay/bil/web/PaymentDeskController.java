package vn.fpt.campusstay.bil.web;

import java.io.IOException;
import java.io.UncheckedIOException;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import vn.fpt.campusstay.bil.internal.PaymentDeskService;
import vn.fpt.campusstay.shared.files.FileStore;
import vn.fpt.campusstay.shared.web.PageQuery;

/** Staff › Payments: Invoices of the Blocks in scope and manual confirmation. Invoices are addressed by code. */
@RestController
class PaymentDeskController {

    private final PaymentDeskService payments;

    PaymentDeskController(PaymentDeskService payments) {
        this.payments = payments;
    }

    @GetMapping("/payments")
    PaymentDeskService.PaymentPage list(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String block, @RequestParam(required = false) String q,
            @RequestParam(required = false) String type, @RequestParam(required = false) String status,
            @RequestParam(required = false) String method, @RequestParam(required = false) String date,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return payments.list(new PaymentDeskService.Filter(termId, block, q, type, status, method, date),
                PageQuery.of(page, pageSize));
    }

    @PostMapping(path = "/payments/{invoiceId}/confirm", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void confirm(@PathVariable String invoiceId, @RequestParam(required = false) Long amount,
            @RequestParam(required = false) String reference,
            @RequestPart(name = "receipt", required = false) MultipartFile receipt) {
        payments.confirm(invoiceId, new PaymentDeskService.ConfirmCommand(amount, reference,
                receipt == null ? null : receipt.getOriginalFilename(), bytes(receipt)));
    }

    /** The receipt attached on manual confirmation (A-09). */
    @GetMapping("/payments/{invoiceId}/receipt-file")
    ResponseEntity<byte[]> receiptFile(@PathVariable String invoiceId) {
        FileStore.FileContent file = payments.receiptFile(invoiceId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.file().contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(file.file().name()).build().toString())
                .body(file.bytes());
    }

    private static byte[] bytes(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return null;
        }
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
