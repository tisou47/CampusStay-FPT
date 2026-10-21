package vn.fpt.campusstay.bil.web;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.bil.internal.StudentInvoiceService;
import vn.fpt.campusstay.shared.web.PageQuery;

/** Student › Payments. Invoices are addressed by their code ({@code INV-SP27-000123}, C-19). */
@RestController
class StudentInvoiceController {

    private final StudentInvoiceService invoices;

    StudentInvoiceController(StudentInvoiceService invoices) {
        this.invoices = invoices;
    }

    @GetMapping("/students/me/invoices")
    StudentInvoiceService.InvoicePage mine(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return invoices.mine(termId, PageQuery.of(page, pageSize));
    }

    @GetMapping("/invoices/{id}")
    StudentInvoiceService.InvoiceDetail detail(@PathVariable String id) {
        return invoices.detail(id);
    }

    @GetMapping("/invoices/{id}/payment")
    StudentInvoiceService.PaymentPage payment(@PathVariable String id) {
        return invoices.payment(id);
    }

    @PostMapping("/invoices/{id}/payment/refresh")
    StudentInvoiceService.QrRefresh refresh(@PathVariable String id) {
        return invoices.refresh(id);
    }

    @GetMapping("/invoices/{id}/receipt")
    ResponseEntity<byte[]> receipt(@PathVariable String id) {
        StudentInvoiceService.Receipt receipt = invoices.receipt(id);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(receipt.fileName()).build().toString())
                .body(receipt.pdf());
    }
}
