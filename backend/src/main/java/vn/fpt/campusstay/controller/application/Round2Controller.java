package vn.fpt.campusstay.controller.application;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.dto.PageQuery;
import vn.fpt.campusstay.service.application.Round2OfferList;
import vn.fpt.campusstay.service.application.Round2Service;

/** A Waitlisted student's Round-2 offer, and the Managers' list of offers. */
@RestController
class Round2Controller {

    record RespondRequest(Boolean accept, String optionId) {
    }

    private final Round2Service round2;
    private final Round2OfferList offers;

    Round2Controller(Round2Service round2, Round2OfferList offers) {
        this.round2 = round2;
        this.offers = offers;
    }

    /** Managers: who Round 2 reached, and the Waitlisted students still without an offer (A-58). */
    @GetMapping("/round2/offers")
    Round2OfferList.Page offers(@RequestParam(required = false) Long termId,
            @RequestParam(required = false) String status, @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer page, @RequestParam(required = false) Integer pageSize) {
        return offers.list(termId, status, q, PageQuery.of(page, pageSize));
    }

    /** The student leaves the waitlist; the Deposit is refunded in full after a Manager approves (A-61). */
    @PostMapping("/applications/{id}/withdraw")
    Round2Service.Withdrawn withdraw(@PathVariable String id) {
        return round2.withdraw(id);
    }

    @GetMapping("/students/me/round2-offer")
    Round2Service.MyOffer mine() {
        return round2.mine();
    }

    @PostMapping("/round2-offers/{id}/respond")
    Round2Service.Responded respond(@PathVariable String id, @RequestBody RespondRequest body) {
        return round2.respond(id, body.accept(), body.optionId());
    }
}
