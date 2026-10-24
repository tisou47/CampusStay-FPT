package vn.fpt.campusstay.service.auth;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.fpt.campusstay.common.i18n.Locales;
import vn.fpt.campusstay.exception.FieldErrors;
import vn.fpt.campusstay.security.CurrentUser;

/**
 * The signed-in person's own settings. The language (ADR-25) is a personal preference, not a change to
 * dormitory data, so it is not written to the Audit Log.
 */
@Service
public class AccountService {

    private final JdbcClient jdbc;
    private final CurrentUser currentUser;

    AccountService(JdbcClient jdbc, CurrentUser currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    /** Saves {@code vi} or {@code en} as the account's language; notifications, push and emails follow it. */
    @Transactional
    public void setLocale(String value) {
        String locale = value != null && value.strip().length() == 2 ? Locales.parse(value) : null;
        if (locale == null) {
            throw FieldErrors.single("locale", "Choose vi or en.");
        }
        jdbc.sql("UPDATE auth_user SET locale = :locale WHERE id = :id")
                .param("locale", locale).param("id", currentUser.get().userId()).update();
    }
}
