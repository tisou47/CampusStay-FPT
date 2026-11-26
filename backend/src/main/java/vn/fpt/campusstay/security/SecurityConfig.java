package vn.fpt.campusstay.security;

import java.util.List;
import java.util.regex.Pattern;

import jakarta.servlet.DispatcherType;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import vn.fpt.campusstay.service.auth.SessionService;

/**
 * Stateless API security. Coarse role rules by URL prefix live here; finer rules
 * (Block scope, ownership) are enforced in services via {@code BlockScope} and
 * {@code CurrentUser}. Paths are relative to the {@code /api} context path.
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    /** Student actions on resources shared with the back office (the services still check owner and role). */
    private static final String[] STUDENT_GETS = { "/applications/eligibility", "/applications/{id}",
            "/invoices/{id}", "/invoices/{id}/payment", "/invoices/{id}/receipt", "/maintenance-requests/options",
            "/maintenance-requests/{id}", "/room-changes/options", "/swap-board", "/swap-invitations/{id}" };
    private static final String[] STUDENT_POSTS = { "/applications", "/applications/roommate-check",
            "/applications/{id}/cancel", "/applications/{id}/withdraw", "/roommate-invitations/{id}/respond",
            "/round2-offers/{id}/respond", "/invoices/{id}/claim", "/invoices/{id}/payment/refresh",
            "/maintenance-requests", "/maintenance-requests/{id}/confirm", "/room-changes", "/swaps",
            "/swap-board/posts/{id}/request", "/swap-invitations/{id}/respond" };

    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, SessionService sessions) throws Exception {
        http
                // Bearer tokens in a header, no cookies: CSRF does not apply.
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {
                })
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .requestCache(cache -> cache.disable())
                .exceptionHandling(e -> e
                        .authenticationEntryPoint(JsonSecurityHandlers.unauthorized())
                        .accessDeniedHandler(JsonSecurityHandlers.forbidden()))
                .authorizeHttpRequests(auth -> auth
                        // The second dispatch that ends a streamed answer (SseEmitter.complete) carries no bearer
                        // token (the token filter runs once per request); its request was authorized when it came
                        // in. Denying it cut the connection after the last event: the browser said "NetworkError"
                        // under a whole answer, and a proxy in front kept the chat waiting.
                        .dispatcherTypeMatchers(DispatcherType.ASYNC).permitAll()
                        .requestMatchers(HttpMethod.POST, "/auth/sign-in", "/auth/google", "/auth/password/forgot",
                                "/auth/password/reset")
                        .permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/actuator/metrics", "/actuator/metrics/**").hasRole("ADMIN")
                        .requestMatchers("/students/**").hasRole("STUDENT")
                        .requestMatchers("/admin/**").hasRole("ADMIN")
                        .requestMatchers("/auth/**", "/notifications", "/notifications/**", "/terms", "/banks",
                                "/catalog", "/registration-periods/**", "/devices", "/devices/unregister")
                        .authenticated()
                        .requestMatchers(HttpMethod.GET, STUDENT_GETS).authenticated()
                        .requestMatchers(HttpMethod.POST, STUDENT_POSTS).authenticated()
                        .requestMatchers(HttpMethod.PUT, "/swap-board/my-post").authenticated()
                        // Default deny for students (BE-AUTH-08): a new endpoint is back office until listed above.
                        .anyRequest().hasAnyRole("STAFF", "MANAGER", "ADMIN"))
                .addFilterBefore(new BearerTokenFilter(sessions), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private static final String REGEX = "regex:";

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }

    /**
     * In development the web app calls through the Vite proxy (same origin), so
     * CORS matters only when the API is served from another origin. Entries are
     * origin patterns, so one entry such as {@code https://campusstay-*-tisou.vercel.app}
     * also admits the Vercel preview deployments. Auth is a bearer token, not a
     * cookie, so an admitted origin still cannot act as a signed-in user.
     * <p>An entry {@code regex:<pattern>} must match the whole origin: production lists only the shapes of this
     * project's Vercel previews, since a {@code *} also admits any project someone names to fit (BE-AUTH-09).
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${campusstay.cors.allowed-origins:}") List<String> allowedOrigins) {
        List<String> entries = allowedOrigins.stream().map(String::trim).filter(o -> !o.isBlank()).toList();
        List<Pattern> exact = entries.stream().filter(o -> o.startsWith(REGEX)).map(o -> Pattern.compile(o.substring(REGEX.length())))
                .toList();
        CorsConfiguration config = new CorsConfiguration() {
            @Override
            public String checkOrigin(String origin) {
                String admitted = super.checkOrigin(origin);
                return admitted != null || origin == null ? admitted
                        : exact.stream().anyMatch(p -> p.matcher(origin).matches()) ? origin : null;
            }
        };
        config.setAllowedOriginPatterns(entries.stream().filter(o -> !o.startsWith(REGEX)).toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", ShiftGate.ACK_HEADER));
        config.setExposedHeaders(List.of("Content-Disposition"));
        config.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
