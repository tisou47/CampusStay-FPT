package vn.fpt.campusstay.service.auth;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

import vn.fpt.campusstay.exception.ApiException;

/**
 * Password rules. BCrypt only uses the first 72 bytes, so longer passwords are
 * rejected instead of being silently truncated.
 */
final class PasswordPolicy {

    static final String RULE = "Use 8 to 64 characters with at least one letter and one number.";

    private PasswordPolicy() {
    }

    static void check(String password, String email) {
        if (password == null || password.length() < 8 || password.length() > 64
                || password.getBytes(StandardCharsets.UTF_8).length > 72
                || password.chars().noneMatch(Character::isLetter)
                || password.chars().noneMatch(Character::isDigit)) {
            throw ApiException.badRequest("WEAK_PASSWORD", RULE);
        }
        if (email != null) {
            String local = email.toLowerCase(Locale.ROOT).split("@")[0];
            if (!local.isBlank() && password.toLowerCase(Locale.ROOT).contains(local)) {
                throw ApiException.badRequest("WEAK_PASSWORD", "The password must not contain your email name.");
            }
        }
    }
}
