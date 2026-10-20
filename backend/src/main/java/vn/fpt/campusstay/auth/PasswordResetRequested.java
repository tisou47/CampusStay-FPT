package vn.fpt.campusstay.auth;

import java.time.Instant;

/**
 * Published inside the AUTH transaction; NTF writes the email to its outbox in
 * the same transaction, so the token and the email commit together.
 *
 * @param purpose {@code INVITE} (new account) or {@code PASSWORD_RESET}
 * @param link    one-time link to the web app's set-password page
 */
public record PasswordResetRequested(long userId, String email, String name, String purpose, String link,
        Instant expiresAt) {
}
