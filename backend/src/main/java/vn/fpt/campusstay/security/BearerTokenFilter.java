package vn.fpt.campusstay.security;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import vn.fpt.campusstay.service.auth.SessionService;

/**
 * Reads {@code Authorization: Bearer <token>} and, when the session is valid,
 * puts the {@link vn.fpt.campusstay.security.AuthenticatedUser} in the security
 * context. An invalid token simply leaves the request anonymous; protected
 * endpoints then answer 401, which makes the web app sign out (contract).
 * <p>Not a Spring bean on purpose: as a bean it would also be registered as a
 * plain servlet filter and run twice.
 */
class BearerTokenFilter extends OncePerRequestFilter {

    private final SessionService sessions;

    BearerTokenFilter(SessionService sessions) {
        this.sessions = sessions;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            sessions.authenticate(header.substring(7).trim()).ifPresent(user -> {
                var authentication = UsernamePasswordAuthenticationToken.authenticated(user, null,
                        List.of(new SimpleGrantedAuthority(user.role().authority())));
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(authentication);
                SecurityContextHolder.setContext(context);
            });
        }
        try {
            chain.doFilter(request, response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
