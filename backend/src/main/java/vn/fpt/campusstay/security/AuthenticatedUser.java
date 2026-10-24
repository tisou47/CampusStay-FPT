package vn.fpt.campusstay.security;

import java.security.Principal;
import java.util.Set;

/**
 * The signed-in user of the current request (Spring Security principal).
 *
 * @param locale       the account's language, {@code vi} or {@code en} (ADR-25)
 * @param passwordSet  whether the account has a CampusStay password; an account created by Google sign-up has none
 *                     until the person sets one, and until then only the setup endpoints answer (ADR-26)
 * @param verification students only: {@code VERIFIED}, {@code PENDING} or {@code REJECTED}, or {@code NONE} while
 *                     the student who signed up has not sent the sign-up form; {@code null} for the back office
 * @param blockIds     Buildings this Staff member works in, or every active Building for a Manager (ADR-19);
 *                     empty for students and admins (admins see every Block)
 * @param sessionId    the {@code auth_session} row behind the bearer token
 */
public record AuthenticatedUser(
        long userId,
        String email,
        String name,
        Role role,
        String studentCode,
        String title,
        String locale,
        boolean passwordSet,
        String verification,
        Set<Long> blockIds,
        long sessionId) implements Principal {

    /** Verification of a student who has not sent the sign-up form yet. */
    public static final String NO_PROFILE = "NONE";

    @Override
    public String getName() {
        return email;
    }

    public boolean is(Role r) {
        return role == r;
    }

    /** A student whose directory record a Manager or the student list confirmed. */
    public boolean verified() {
        return "VERIFIED".equals(verification);
    }

    /** What the account must do before using the system: {@code PASSWORD}, {@code PROFILE}, or null when ready. */
    public String pendingSetup() {
        if (!passwordSet) {
            return "PASSWORD";
        }
        return role == Role.STUDENT && NO_PROFILE.equals(verification) ? "PROFILE" : null;
    }
}
