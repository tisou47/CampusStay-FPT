package vn.fpt.campusstay.app.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.app.internal.Round2Service;

/** A Waitlisted student's Round-2 offer. */
@RestController
class Round2Controller {

    record RespondRequest(Boolean accept, String optionId) {
    }

    private final Round2Service round2;

    Round2Controller(Round2Service round2) {
        this.round2 = round2;
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
