package vn.fpt.campusstay.security;

import java.util.Optional;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import vn.fpt.campusstay.exception.ApiException;

/** Access to the signed-in user from any module. */
@Component
public class CurrentUser {

    public Optional<AuthenticatedUser> find() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
            return Optional.of(user);
        }
        return Optional.empty();
    }

    public AuthenticatedUser get() {
        return find().orElseThrow(() -> ApiException.unauthorized("UNAUTHENTICATED", "Your session has ended. Sign in again."));
    }

    public long id() {
        return get().userId();
    }

    /** Fails with 403 unless the user has one of the roles. */
    public AuthenticatedUser require(Role... roles) {
        AuthenticatedUser user = get();
        for (Role role : roles) {
            if (user.role() == role) {
                return user;
            }
        }
        throw ApiException.forbidden("FORBIDDEN", "You do not have permission to do this.");
    }

    /** Fails with 403 unless the user's role has the permission (the rule table of the permission matrix). */
    public AuthenticatedUser require(Permission permission) {
        AuthenticatedUser user = get();
        if (!permission.allows(user.role())) {
            throw ApiException.forbidden("FORBIDDEN", "You do not have permission to do this.");
        }
        return user;
    }
}
