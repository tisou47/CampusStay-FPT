package vn.fpt.campusstay.auth;

import java.security.Principal;
import java.util.Set;

/**
 * The signed-in user of the current request (Spring Security principal).
 *
 * @param blockIds Buildings this Staff/Manager may see; empty for students and admins
 *                 (admins see every Block).
 * @param sessionId the {@code auth_session} row behind the bearer token
 */
public record AuthenticatedUser(
        long userId,
        String email,
        String name,
        Role role,
        String studentCode,
        String title,
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
