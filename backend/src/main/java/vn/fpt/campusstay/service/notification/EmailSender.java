package vn.fpt.campusstay.service.notification;

/** Port for sending one email (ADR-09). */
public interface EmailSender {

    void send(String to, String subject, String html) throws Exception;
}
