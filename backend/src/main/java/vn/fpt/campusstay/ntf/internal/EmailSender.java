package vn.fpt.campusstay.ntf.internal;

/** Port for sending one email (ADR-09). */
interface EmailSender {

    void send(String to, String subject, String html) throws Exception;
}
