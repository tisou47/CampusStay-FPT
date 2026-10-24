package vn.fpt.campusstay.service.notification;

/** Port for sending one email (ADR-09). */
public interface EmailSender {

    /**
     * @param demoRecipient the address belongs to a fictional account of the base data or a demo scenario: only those
     *                      emails go to the demo mailbox when one is set (spec O-3)
     */
    void send(String to, String subject, String html, boolean demoRecipient) throws Exception;
}
