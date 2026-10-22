package vn.fpt.campusstay.common;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Client address and user agent of the current HTTP request, for the Audit Log
 * and sessions. Behind a reverse proxy set {@code server.forward-headers-strategy}
 * so {@code getRemoteAddr()} is the real client.
 */
public final class RequestInfo {

    private RequestInfo() {
    }

    public static String ip() {
        HttpServletRequest request = current();
        return request == null ? null : request.getRemoteAddr();
    }

    public static String userAgent() {
        HttpServletRequest request = current();
        if (request == null) {
            return null;
        }
        String ua = request.getHeader("User-Agent");
        return ua == null || ua.length() <= 300 ? ua : ua.substring(0, 300);
    }

    private static HttpServletRequest current() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            return attributes.getRequest();
        }
        return null;
    }
}
