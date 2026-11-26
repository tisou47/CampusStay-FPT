package vn.fpt.campusstay.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import vn.fpt.campusstay.PostgresTestcontainer;
import vn.fpt.campusstay.TestAuth;

/**
 * Q1 (BE-AUTH-08): every endpoint of the running application, read from {@link RequestMappingHandlerMapping}, is
 * called with a student token; each one not on the explicit allow-list must answer 403 before any service runs.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(PostgresTestcontainer.class)
class EndpointRoleSweepIT {

    /** Path prefixes a student may reach (each service then checks role and owner). */
    private static final List<String> STUDENT_PREFIXES = List.of("/students/", "/auth/", "/files/", "/notifications",
            "/registration-periods/", "/v3/api-docs", "/swagger-ui");

    /** Student endpoints on resources shared with the back office, exactly as mapped ("METHOD pattern"). */
    private static final Set<String> STUDENT_ENDPOINTS = Set.of(
            "GET /terms", "GET /banks", "GET /catalog", "POST /devices", "POST /devices/unregister",
            "GET /applications/eligibility", "POST /applications/roommate-check", "POST /applications",
            "GET /applications/{id}", "POST /applications/{id}/cancel", "POST /applications/{id}/withdraw",
            "POST /roommate-invitations/{id}/respond", "POST /round2-offers/{id}/respond",
            "GET /invoices/{id}", "GET /invoices/{id}/payment", "POST /invoices/{id}/payment/refresh",
            "GET /invoices/{id}/receipt", "POST /invoices/{id}/claim",
            "GET /maintenance-requests/options", "POST /maintenance-requests", "GET /maintenance-requests/{id}",
            "POST /maintenance-requests/{id}/confirm", "GET /room-changes/options", "POST /room-changes",
            "POST /swaps", "GET /swap-board", "PUT /swap-board/my-post", "POST /swap-board/posts/{id}/request",
            "GET /swap-invitations/{id}", "POST /swap-invitations/{id}/respond");

    @Autowired
    MockMvc mvc;

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    RequestMappingHandlerMapping mapping;

    private static boolean allowed(String method, String pattern) {
        return STUDENT_PREFIXES.stream().anyMatch(pattern::startsWith) || pattern.equals("/error")
                || STUDENT_ENDPOINTS.contains(method + " " + pattern);
    }

    /** TC-AUTH-300: a student token gets 403 on every back-office endpoint (default deny at the URL level). */
    @Test
    void studentIsDeniedEveryBackOfficeEndpoint() throws Exception {
        String auth = TestAuth.bearer(mvc, "se190047@student.campusstay.test");
        List<String> open = new ArrayList<>();
        Set<String> mapped = new TreeSet<>();
        int called = 0;
        for (var info : mapping.getHandlerMethods().keySet()) {
            Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
            for (String pattern : info.getPathPatternsCondition().getPatternValues()) {
                for (RequestMethod m : methods.isEmpty() ? Set.of(RequestMethod.GET) : methods) {
                    mapped.add(m + " " + pattern);
                    if (allowed(m.name(), pattern)) {
                        continue;
                    }
                    String url = pattern.replaceAll("[{][^}]+[}]", "1");
                    int status = mvc.perform(request(HttpMethod.valueOf(m.name()), url)
                            .header(HttpHeaders.AUTHORIZATION, auth).contentType(MediaType.APPLICATION_JSON)
                            .content("{}")).andReturn().getResponse().getStatus();
                    called++;
                    if (status != 403) {
                        open.add(m + " " + pattern + " → " + status);
                    }
                }
            }
        }
        assertThat(called).as("back-office endpoints swept").isGreaterThan(250);
        assertThat(open).as("back-office endpoints a student reaches").isEmpty();
        assertThat(mapped).as("allow-list entries that no longer exist").containsAll(STUDENT_ENDPOINTS);
    }
}
