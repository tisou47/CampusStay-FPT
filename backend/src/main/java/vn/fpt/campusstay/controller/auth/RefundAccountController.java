package vn.fpt.campusstay.controller.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.auth.RefundAccountService;

/** The student's own refund bank account (A-62). */
@RestController
class RefundAccountController {

    record AccountRequest(@Size(max = 100, message = "Use at most 100 characters.") String holder,
            @Size(max = 40, message = "Enter the account number: 6 to 20 digits.") String number,
            @Size(max = 100, message = "Use at most 100 characters.") String bank) {
    }

    private final RefundAccountService accounts;

    RefundAccountController(RefundAccountService accounts) {
        this.accounts = accounts;
    }

    @GetMapping("/students/me/refund-account")
    RefundAccountService.Mine mine() {
        return accounts.mine();
    }

    @PutMapping("/students/me/refund-account")
    RefundAccountService.Mine save(@Valid @RequestBody AccountRequest body) {
        return accounts.save(body.holder(), body.number(), body.bank());
    }
}
