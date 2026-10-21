package vn.fpt.campusstay.ntf.internal;

/** Port for one push message to one device (FCM for Android, ADR-10). */
interface PushSender {

    enum Outcome {
        SENT,
        /** The device token is no longer valid: stop using it. */
        INVALID_TOKEN,
        FAILED
    }

    Outcome send(String token, String title, String body, String link);
}
