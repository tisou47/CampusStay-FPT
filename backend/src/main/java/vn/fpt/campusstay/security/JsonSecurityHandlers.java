package vn.fpt.campusstay.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.MediaType;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;

import vn.fpt.campusstay.common.i18n.Locales;

/** Contract error bodies for 401 and 403 raised by the security filter chain, in the request's language (ADR-25). */
final class JsonSecurityHandlers {

    private JsonSecurityHandlers() {
    }

    static AuthenticationEntryPoint unauthorized() {
        return (request, response, ex) -> write(response, HttpServletResponse.SC_UNAUTHORIZED, "UNAUTHENTICATED",
                vi(request) ? "Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại." : "Your session has ended. Sign in again.");
    }

    static AccessDeniedHandler forbidden() {
        return (request, response, ex) -> write(response, HttpServletResponse.SC_FORBIDDEN, "FORBIDDEN",
                vi(request) ? "Bạn không có quyền thực hiện thao tác này." : "You do not have permission to do this.");
    }

    private static boolean vi(HttpServletRequest request) {
        return Locales.VI.equals(Locales.parse(request.getHeader("Accept-Language")));
    }

    private static void write(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"message\":\"" + message + "\",\"code\":\"" + code + "\"}");
    }
}
