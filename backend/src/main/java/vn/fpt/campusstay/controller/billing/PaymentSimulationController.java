package vn.fpt.campusstay.controller.billing;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.billing.BankFeed;

/**
 * Dev profile only (A-08): pays an Invoice as if SePay had reported the exact
 * transfer, so the payment flow can be demonstrated without a bank account.
 * Not present in the test and prod profiles.
 */
@Profile("dev")
@RestController
class PaymentSimulationController {

    private final BankFeed bankFeed;

    PaymentSimulationController(BankFeed bankFeed) {
        this.bankFeed = bankFeed;
    }

    @PostMapping("/dev/invoices/{id}/simulate-payment")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void simulate(@PathVariable String id) {
        bankFeed.simulate(id);
    }
}
