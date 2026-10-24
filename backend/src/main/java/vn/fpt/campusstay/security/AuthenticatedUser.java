package vn.fpt.campusstay.security;

import java.security.Principal;
import java.util.Set;

/**
 * The signed-in user of the current request (Spring Security principal).
 *
 * @param locale    the account's language, {@code vi} or {@code en} (ADR-25)
 * @param blockIds  Buildings this Staff member works in, or every active Building for a Manager (ADR-19);
 *                  empty for students and admins (admins see every Block)
 * @param sessionId the {@code auth_session} row behind the bearer token
 */
public record AuthenticatedUser(
        long userId,
        String email,
        String name,
        Role role,
        String studentCode,
        String title,
        String locale,
        Set<Long> blockIds,
        long sessionId) implements Principal {

    @Override
    public String getName() {
        return email;
    }

    public boolean is(Role r) {
        return role == r;
    }
}
