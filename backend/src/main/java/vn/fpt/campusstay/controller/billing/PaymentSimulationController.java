package vn.fpt.campusstay.controller.billing;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.billing.BankFeed;

/**
 * Payment simulator (A-08): pays an Invoice as if SePay had reported the exact transfer, so the payment flow can
 * be demonstrated without a bank account. On only with {@code campusstay.payment.simulator=true}: always in the dev
 * profile, and on a demo server with {@code PAYMENT_SIMULATOR=true}. The student who owns the Invoice or an Admin
 * may use it.
 */
@ConditionalOnProperty(name = "campusstay.payment.simulator", havingValue = "true")
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
