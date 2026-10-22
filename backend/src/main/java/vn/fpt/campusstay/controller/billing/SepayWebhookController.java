package vn.fpt.campusstay.controller.billing;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import vn.fpt.campusstay.service.billing.BankFeed;

/**
 * {@code POST /webhooks/sepay} (A-07), called by SePay for every transfer to the
 * receiving account. Public URL; authenticated by SePay's API key. SePay counts a
 * delivery as done only for 200/201 with {@code {"success": true}}.
 */
@RestController
class SepayWebhookController {

    private final BankFeed bankFeed;

    SepayWebhookController(BankFeed bankFeed) {
        this.bankFeed = bankFeed;
    }

    @PostMapping("/webhooks/sepay")
    ResponseEntity<Map<String, Object>> receive(@RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody String body) {
        bankFeed.receiveSepay(auth, body);
        return ResponseEntity.ok(Map.of("success", true));
    }
}
