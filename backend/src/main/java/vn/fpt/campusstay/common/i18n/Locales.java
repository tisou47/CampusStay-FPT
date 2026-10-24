package vn.fpt.campusstay.common.i18n;

import java.util.Locale;

import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * The two languages of CampusStay (ADR-25): {@code vi} (the default of new accounts) and {@code en}.
 * A request chooses its language with {@code Accept-Language}; without one, API messages stay in
 * English, as before, so scripts and tests read the same texts.
 */
public final class Locales {

    public static final String VI = "vi";
    public static final String EN = "en";

    private Locales() {
    }

    /** {@code vi} or {@code en}, or {@code null} when the value names neither. */
    public static String parse(String value) {
        if (value == null) {
            return null;
        }
        String v = value.strip().toLowerCase(Locale.ROOT);
        return v.startsWith(VI) ? VI : v.startsWith(EN) ? EN : null;
    }

    /** The language of the current request's {@code Accept-Language}; English outside a request or without one. */
    public static String ofRequest() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            String found = parse(attributes.getRequest().getHeader("Accept-Language"));
            if (found != null) {
                return found;
            }
        }
        return EN;
    }
}
