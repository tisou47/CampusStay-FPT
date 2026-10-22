package vn.fpt.campusstay.service.billing;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;
import vn.fpt.campusstay.security.AuthenticatedUser;
import vn.fpt.campusstay.security.CurrentUser;
import vn.fpt.campusstay.security.Role;
import vn.fpt.campusstay.common.audit.Actor;
import vn.fpt.campusstay.common.audit.AuditLog;
import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.security.Tokens;
import vn.fpt.campusstay.config.PaymentProperties;
import vn.fpt.campusstay.repository.billing.InvoiceStore;

/**
 * Entry of bank transfers: the SePay webhook, and the simulated payment of the
 * dev profile. Each transfer is stored first (its own transaction), then matched
 * in another; a matching failure leaves it pending for {@link BankFeedRetryJob},
 * and SePay still gets its success answer.
 */
@Service
public class BankFeed {

    private static final Logger log = LoggerFactory.getLogger(BankFeed.class);

    private final SepayInbox inbox;
    private final PaymentProcessor processor;
    private final InvoiceStore invoices;
    private final PaymentProperties payment;
    private final CurrentUser currentUser;
    private final JsonMapper json;
    private final AuditLog audit;

    public BankFeed(SepayInbox inbox, PaymentProcessor processor, InvoiceStore invoices, PaymentProperties payment,
            CurrentUser currentUser, JsonMapper json, AuditLog audit) {
        this.inbox = inbox;
        this.processor = processor;
        this.invoices = invoices;
        this.payment = payment;
        this.currentUser = currentUser;
        this.json = json;
        this.audit = audit;
    }

    /** @param authorization the {@code Authorization} header, expected {@code Apikey <key>} */
    public void receiveSepay(String authorization, String body) {
        String key = payment.sepayApiKey();
        if (key == null || key.isBlank()) {
            throw ApiException.unavailable("SEPAY_DISABLED", "The bank feed is not configured.");
        }
        if (!Tokens.constantTimeEquals(authorization, "Apikey " + key)) {
            audit.recordIndependently(Actor.anonymous("SePay webhook"), "WEBHOOK_REFUSED", AuditLog.Tone.DANGER,
                    "Webhook", null, "SePay", null);
            throw ApiException.unauthorized("UNAUTHENTICATED", "Invalid API key.");
        }
        SepayInbox.Transfer transfer;
        try {
            transfer = json.readValue(body, SepayInbox.Transfer.class);
        } catch (JacksonException e) {
            throw ApiException.badRequest("BAD_REQUEST_BODY", "The webhook body could not be read.");
        }
        if (transfer.id() == null) {
            throw ApiException.badRequest("BAD_REQUEST_BODY", "The webhook body has no transaction id.");
        }
        inbox.store("SEPAY", String.valueOf(transfer.id()), transfer, body).ifPresent(this::processQuietly);
    }

    /**
     * Dev profile only: pays an unpaid Invoice as if the bank had reported the exact
     * transfer (provider {@code MOCK}). The owner student or the Admin may use it.
     */
    public void simulate(String invoiceIdOrCode) {
        AuthenticatedUser user = currentUser.get();
        InvoiceStore.Invoice invoice = invoices.find(invoiceIdOrCode)
                .filter(i -> user.is(Role.ADMIN) || user.is(Role.STUDENT) && i.studentId() == user.userId())
                .orElseThrow(() -> ApiException.notFound("This Invoice does not exist."));
        String txnId = "MOCK-" + UUID.randomUUID().toString().replace("-", "");
        SepayInbox.Transfer transfer = new SepayInbox.Transfer(null, "Mock bank", null, payment.accountNumber(),
                invoice.transferContent(), invoice.transferContent(), "in", invoice.amount(), txnId);
        inbox.store("MOCK", txnId, transfer, json.writeValueAsString(transfer)).ifPresent(processor::process);
    }

    private void processQuietly(long transactionId) {
        try {
            processor.process(transactionId);
        } catch (RuntimeException e) {
            log.warn("Bank transaction {} stored but not processed yet: {}", transactionId, e.getClass().getSimpleName());
        }
    }
}
