package vn.fpt.campusstay.security;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import vn.fpt.campusstay.exception.ApiException;

/**
 * Until a new account has set its password (and a student who signed up without a match in the student list has
 * sent the sign-up form), only the endpoints that do those steps answer; every other call is {@code 403} (ADR-26,
 * spec §6.1). The web shows the setup page instead of any other page, and the Android app follows the same rule.
 * An interceptor rather than a filter, so the error goes through the exception handler in the request's language.
 */
@Component
public class AccountSetupGate implements HandlerInterceptor {

    /** Paths relative to {@code /api} that stay open while the setup is not done; the password comes first. */
    private static final List<String> OPEN = List.of("/auth/", "/terms", "/notifications", "/error");
    private static final String SIGN_UP_FORM = "/students/me/verification";

    private final CurrentUser currentUser;

    AccountSetupGate(CurrentUser currentUser) {
        this.currentUser = currentUser;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String step = currentUser.find().map(AuthenticatedUser::pendingSetup).orElse(null);
        if (step == null) {
            return true;
        }
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (OPEN.stream().anyMatch(path::startsWith) || ("PROFILE".equals(step) && path.startsWith(SIGN_UP_FORM))) {
            return true;
        }
        throw "PASSWORD".equals(step)
                ? ApiException.forbidden("PASSWORD_REQUIRED", "Set a CampusStay password before you continue.")
                : ApiException.forbidden("PROFILE_REQUIRED", "Send your student details before you continue.");
    }
}
