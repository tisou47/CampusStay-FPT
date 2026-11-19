package vn.fpt.campusstay.security;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

import vn.fpt.campusstay.exception.ApiException;
import vn.fpt.campusstay.service.auth.StaffActivityService;

/**
 * Every change a Staff member makes is checked against their shift and the work a Manager gave them. Outside either,
 * the call answers {@code 428 SHIFT_CONFIRM_REQUIRED} until it is sent again with {@code X-Shift-Acknowledged: true}
 * (the web asks the person to confirm first). Every change that went through is recorded for the Managers.
 */
@Component
public class ShiftGate implements HandlerInterceptor {

    public static final String ACK_HEADER = "X-Shift-Acknowledged";
    private static final String CHECK = ShiftGate.class.getName() + ".check";
    private static final List<String> ID_VARIABLES = List.of("id", "code", "room", "allocationId", "runId", "invoiceId");

    private static final String SUFFIX = " Confirm to go on: this action is recorded for your Manager.";

    private final CurrentUser currentUser;
    private final StaffActivityService activity;
    private final boolean enabled;

    ShiftGate(CurrentUser currentUser, StaffActivityService activity,
            @Value("${campusstay.auth.shift-gate:true}") boolean enabled) {
        this.enabled = enabled;
        this.currentUser = currentUser;
        this.activity = activity;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        AuthenticatedUser user = currentUser.find().orElse(null);
        if (!enabled || user == null || user.role() != Role.STAFF) {
            return true;
        }
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (!StaffActivityService.watched(request.getMethod(), path)) {
            return true;
        }
        StaffActivityService.Check check = activity.check(user.userId(), path);
        boolean acknowledged = "true".equalsIgnoreCase(request.getHeader(ACK_HEADER));
        if (check.needsConfirmation() && !acknowledged) {
            String message = !check.inShift() && !check.roleMatch()
                    ? "You are outside your shift, and this is not the work your Manager gave you." + SUFFIX
                    : !check.inShift() ? "You are outside your shift." + SUFFIX
                    : "This is not the work your Manager gave you." + SUFFIX;
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("outOfShift", !check.inShift());
            details.put("roleMismatch", !check.roleMatch());
            details.put("handle", check.handleLabel());
            details.put("shiftToday", check.shiftToday());
            throw new ApiException(HttpStatus.PRECONDITION_REQUIRED, "SHIFT_CONFIRM_REQUIRED", message, details);
        }
        request.setAttribute(CHECK, new Pending(user.userId(), check, acknowledged && check.needsConfirmation()));
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        if (!(request.getAttribute(CHECK) instanceof Pending pending)) {
            return;
        }
        Object best = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        String pattern = best != null ? best.toString()
                : request.getRequestURI().substring(request.getContextPath().length());
        String objectId = null;
        if (request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE) instanceof Map<?, ?> vars) {
            objectId = ID_VARIABLES.stream().map(vars::get).filter(v -> v != null).map(Object::toString).findFirst()
                    .orElse(null);
        }
        activity.record(pending.userId(), request.getMethod(), pattern, objectId, pending.check(), pending.acknowledged(),
                response.getStatus());
    }

    private record Pending(long userId, StaffActivityService.Check check, boolean acknowledged) {
    }
}
